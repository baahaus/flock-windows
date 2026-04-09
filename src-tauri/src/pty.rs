//! ConPTY wrapper for spawning processes with pseudo-terminal I/O on Windows.
//!
//! Each pane in Flock gets one `Pty`. The caller spawns a process (e.g. `claude`
//! or `cmd.exe`), then drives it by calling `write_input` / reading the output
//! file handle, and can resize the terminal viewport via `resize`.

#![cfg(windows)]

use std::fs::File;
use std::os::windows::io::FromRawHandle;
use std::ptr;

use windows::{
    core::PWSTR,
    Win32::{
        Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE},
        System::{
            Console::{
                ClosePseudoConsole, CreatePseudoConsole, ResizePseudoConsole, COORD, HPCON,
            },
            Pipes::CreatePipe,
            Threading::{
                CreateProcessW, DeleteProcThreadAttributeList, InitializeProcThreadAttributeList,
                UpdateProcThreadAttribute, WaitForSingleObject, EXTENDED_STARTUPINFO_PRESENT,
                LPPROC_THREAD_ATTRIBUTE_LIST, PROCESS_INFORMATION, STARTUPINFOEXW, STARTUPINFOW,
            },
        },
    },
};

// PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016
const PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE: usize = 0x00020016;

/// A live pseudo-terminal backed by the Windows ConPTY API.
pub struct Pty {
    /// The pseudo-console handle (ConPTY).
    hpcon: HPCON,
    /// Write end of the input pipe (we write here; the process reads from the other side).
    input_write: File,
    /// Read end of the output pipe (we read here; the process writes to the other side).
    output_read: File,
    /// The spawned process information.
    proc_info: PROCESS_INFORMATION,
    /// Current terminal width (columns).
    pub cols: u16,
    /// Current terminal height (rows).
    pub rows: u16,
}

// SAFETY: The raw handles are owned exclusively by this struct.
unsafe impl Send for Pty {}
unsafe impl Sync for Pty {}

impl Pty {
    /// Spawn a new process under a pseudo-terminal.
    ///
    /// # Arguments
    /// * `command` - Executable path or name (e.g. `"claude"`, `"cmd.exe"`).
    /// * `args`    - Command-line arguments (will be appended to `command`).
    /// * `cols`    - Initial terminal width in columns.
    /// * `rows`    - Initial terminal height in rows.
    pub fn spawn(command: &str, args: &[&str], cols: u16, rows: u16) -> Result<Self, String> {
        unsafe {
            // ----------------------------------------------------------------
            // 1. Create two anonymous pipe pairs.
            //    Input  pipe: we write → pty reads  (stdin of child process)
            //    Output pipe: pty writes → we read  (stdout/stderr of child process)
            // ----------------------------------------------------------------
            let mut input_read: HANDLE = INVALID_HANDLE_VALUE;
            let mut input_write: HANDLE = INVALID_HANDLE_VALUE;
            let mut output_read: HANDLE = INVALID_HANDLE_VALUE;
            let mut output_write: HANDLE = INVALID_HANDLE_VALUE;

            CreatePipe(&mut input_read, &mut input_write, None, 0)
                .map_err(|e| format!("CreatePipe (input) failed: {e}"))?;

            CreatePipe(&mut output_read, &mut output_write, None, 0)
                .map_err(|e| {
                    // Clean up the already-created input handles before returning.
                    let _ = CloseHandle(input_read);
                    let _ = CloseHandle(input_write);
                    format!("CreatePipe (output) failed: {e}")
                })?;

            // ----------------------------------------------------------------
            // 2. Create the pseudo console.
            //    ConPTY connects to the *read* end of input and *write* end of
            //    output from the child process perspective.
            // ----------------------------------------------------------------
            let size = COORD {
                X: cols as i16,
                Y: rows as i16,
            };

            let hpcon = CreatePseudoConsole(size, input_read, output_write, 0).map_err(|e| {
                let _ = CloseHandle(input_read);
                let _ = CloseHandle(input_write);
                let _ = CloseHandle(output_read);
                let _ = CloseHandle(output_write);
                format!("CreatePseudoConsole failed: {e}")
            })?;

            // The ConPTY now owns these; close our copies to avoid handle leaks.
            let _ = CloseHandle(input_read);
            let _ = CloseHandle(output_write);

            // ----------------------------------------------------------------
            // 3. Build STARTUPINFOEXW with PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE.
            // ----------------------------------------------------------------
            // First call: query required buffer size.
            let mut attr_list_size: usize = 0;
            let _ = InitializeProcThreadAttributeList(
                LPPROC_THREAD_ATTRIBUTE_LIST(ptr::null_mut()),
                1,
                0,
                &mut attr_list_size,
            );

            // Allocate the buffer as a plain Vec<u8> so we control its lifetime.
            let mut attr_list_buf: Vec<u8> = vec![0u8; attr_list_size];
            let attr_list =
                LPPROC_THREAD_ATTRIBUTE_LIST(attr_list_buf.as_mut_ptr() as *mut _);

            InitializeProcThreadAttributeList(attr_list, 1, 0, &mut attr_list_size).map_err(
                |e| {
                    let _ = CloseHandle(input_write);
                    let _ = CloseHandle(output_read);
                    ClosePseudoConsole(hpcon);
                    format!("InitializeProcThreadAttributeList failed: {e}")
                },
            )?;

            // Store the HPCON value on the stack so we can take its address.
            let hpcon_value = hpcon;
            UpdateProcThreadAttribute(
                attr_list,
                0,
                PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
                Some(hpcon_value.0 as *const _),
                std::mem::size_of::<HPCON>(),
                None,
                None,
            )
            .map_err(|e| {
                let _ = DeleteProcThreadAttributeList(attr_list);
                let _ = CloseHandle(input_write);
                let _ = CloseHandle(output_read);
                ClosePseudoConsole(hpcon);
                format!("UpdateProcThreadAttribute failed: {e}")
            })?;

            let mut startup_info = STARTUPINFOEXW {
                StartupInfo: STARTUPINFOW {
                    cb: std::mem::size_of::<STARTUPINFOEXW>() as u32,
                    ..Default::default()
                },
                lpAttributeList: attr_list,
            };

            // ----------------------------------------------------------------
            // 4. Build the command line as a wide (UTF-16) string.
            // ----------------------------------------------------------------
            let cmdline = if args.is_empty() {
                command.to_owned()
            } else {
                format!("{} {}", command, args.join(" "))
            };

            let mut cmdline_wide: Vec<u16> = cmdline.encode_utf16().chain(std::iter::once(0)).collect();

            // ----------------------------------------------------------------
            // 5. Spawn the process.
            // ----------------------------------------------------------------
            let mut proc_info = PROCESS_INFORMATION::default();

            CreateProcessW(
                None,
                PWSTR(cmdline_wide.as_mut_ptr()),
                None,
                None,
                false,
                EXTENDED_STARTUPINFO_PRESENT,
                None,
                None,
                &mut startup_info.StartupInfo,
                &mut proc_info,
            )
            .map_err(|e| {
                let _ = DeleteProcThreadAttributeList(attr_list);
                let _ = CloseHandle(input_write);
                let _ = CloseHandle(output_read);
                ClosePseudoConsole(hpcon);
                format!("CreateProcessW failed: {e}")
            })?;

            // The attribute list is no longer needed once the process is created.
            DeleteProcThreadAttributeList(attr_list);

            // ----------------------------------------------------------------
            // 6. Return the Pty with user-facing pipe ends.
            // ----------------------------------------------------------------
            Ok(Pty {
                hpcon,
                input_write: File::from_raw_handle(input_write.0 as *mut _),
                output_read: File::from_raw_handle(output_read.0 as *mut _),
                proc_info,
                cols,
                rows,
            })
        }
    }

    /// Resize the pseudo-terminal viewport.
    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<(), String> {
        self.cols = cols;
        self.rows = rows;
        let size = COORD {
            X: cols as i16,
            Y: rows as i16,
        };
        unsafe {
            ResizePseudoConsole(self.hpcon, size)
                .map_err(|e| format!("ResizePseudoConsole failed: {e}"))
        }
    }

    /// Write raw bytes to the process's stdin via the input pipe.
    pub fn write_input(&mut self, data: &[u8]) -> Result<(), String> {
        use std::io::Write;
        self.input_write
            .write_all(data)
            .map_err(|e| format!("write_input failed: {e}"))
    }

    /// Read available bytes from the process's output pipe (non-blocking attempt).
    ///
    /// Returns however many bytes were read. The caller is responsible for
    /// buffering and looping if more data is expected.
    pub fn read_output(&mut self, buf: &mut [u8]) -> Result<usize, String> {
        use std::io::Read;
        self.output_read
            .read(buf)
            .map_err(|e| format!("read_output failed: {e}"))
    }

    /// Clone the output read handle so a background thread can read PTY output
    /// without holding the pane manager lock.
    pub fn try_clone_output(&self) -> Result<File, String> {
        self.output_read
            .try_clone()
            .map_err(|e| format!("try_clone_output failed: {e}"))
    }

    /// Terminate the child process and release all ConPTY resources.
    pub fn kill(&mut self) {
        unsafe {
            // Terminate the process (best-effort; ignore errors).
            let _ = windows::Win32::System::Threading::TerminateProcess(
                self.proc_info.hProcess,
                1,
            );

            // Wait briefly for the process to exit.
            let _ = WaitForSingleObject(self.proc_info.hProcess, 500);

            // Close process and thread handles.
            if !self.proc_info.hProcess.is_invalid() {
                let _ = CloseHandle(self.proc_info.hProcess);
                self.proc_info.hProcess = INVALID_HANDLE_VALUE;
            }
            if !self.proc_info.hThread.is_invalid() {
                let _ = CloseHandle(self.proc_info.hThread);
                self.proc_info.hThread = INVALID_HANDLE_VALUE;
            }

            // Close the pseudo-console. This also closes the underlying pipe
            // ends that the ConPTY holds.
            ClosePseudoConsole(self.hpcon);
        }
    }
}

impl Drop for Pty {
    fn drop(&mut self) {
        self.kill();
    }
}
