use std::time::{Duration, Instant};
use regex::Regex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentState {
    Idle,
    Thinking,
    Reading,
    Running,
    Writing,
    Error,
    Waiting,
}

impl AgentState {
    pub fn priority(&self) -> u8 {
        match self {
            AgentState::Idle => 0,
            AgentState::Thinking => 1,
            AgentState::Reading => 2,
            AgentState::Running => 3,
            AgentState::Writing => 4,
            AgentState::Error => 5,
            AgentState::Waiting => 6,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            AgentState::Idle => "Idle",
            AgentState::Thinking => "Thinking",
            AgentState::Reading => "Reading",
            AgentState::Running => "Running",
            AgentState::Writing => "Writing",
            AgentState::Error => "Error",
            AgentState::Waiting => "Waiting for input",
        }
    }
}

pub struct ClaudeStateDetector {
    pub current_state: AgentState,
    pub last_activity: Instant,
    pub idle_timeout: Duration,
    pub ansi_regex: Regex,
}

impl ClaudeStateDetector {
    pub fn new() -> Self {
        Self {
            current_state: AgentState::Idle,
            last_activity: Instant::now(),
            idle_timeout: Duration::from_secs(4),
            ansi_regex: Regex::new(
                r"\x1B(?:\[[0-9;?]*[A-Za-z]|\][^\x07]*\x07|\([A-Z]|[>=<])"
            ).expect("invalid ANSI regex"),
        }
    }

    fn strip_ansi<'a>(&self, raw: &'a str) -> std::borrow::Cow<'a, str> {
        self.ansi_regex.replace_all(raw, "")
    }

    fn detect_from_text(text: &str) -> AgentState {
        // Check all categories, return highest-priority match.
        let mut best = AgentState::Idle;

        macro_rules! upgrade {
            ($state:expr) => {
                if $state.priority() > best.priority() {
                    best = $state;
                }
            };
        }

        // Waiting (priority 6)
        if text.contains("wants to")
            || text.contains("Permission")
            || text.contains("(y/n)")
            || text.contains("Yes, allow")
            || text.contains("No, deny")
            || text.contains("Do you want")
        {
            upgrade!(AgentState::Waiting);
        }

        // Error (priority 5)
        if text.contains("Error:")
            || text.contains("error:")
            || text.contains("FAILED")
            || text.contains("API error")
            || text.contains("hit your limit")
            || text.contains("Rate limit")
        {
            upgrade!(AgentState::Error);
        }

        // Writing (priority 4)
        if text.contains("Write(")
            || text.contains("Edit(")
            || text.contains("write_file")
            || text.contains("edit_file")
            || text.contains("create_file")
            || text.contains("Writing")
            || text.contains("Wrote ")
        {
            upgrade!(AgentState::Writing);
        }

        // Running (priority 3)
        if text.contains("Bash(")
            || text.contains("running for")
            || text.contains("Executing")
        {
            upgrade!(AgentState::Running);
        }

        // Reading (priority 2)
        if text.contains("Reading")
            || text.contains("Searching")
            || text.contains("Searched")
            || text.contains("Queried")
            || text.contains("Grep(")
            || text.contains("Read(")
            || text.contains("glob(")
            || text.contains("finder(")
        {
            upgrade!(AgentState::Reading);
        }

        // Thinking (priority 1) -- braille spinner block U+2800..U+28FF OR keywords
        let has_braille = text.chars().any(|c| ('\u{2800}'..='\u{28FF}').contains(&c));
        if has_braille
            || text.contains("Thinking")
            || text.contains("Reasoning")
            || text.contains("Thought for")
            || text.contains("Resolving")
        {
            upgrade!(AgentState::Thinking);
        }

        best
    }

    /// Feed raw terminal output. Returns the new current state.
    pub fn feed(&mut self, raw: &str) -> AgentState {
        let cleaned = self.strip_ansi(raw);
        let detected = Self::detect_from_text(&cleaned);

        // Only upgrade by priority, or accept idle
        if detected == AgentState::Idle
            || detected.priority() > self.current_state.priority()
        {
            self.current_state = detected;
        }

        if self.current_state != AgentState::Idle {
            self.last_activity = Instant::now();
        }

        self.current_state
    }

    /// Returns current state, falling back to Idle if idle_timeout has elapsed.
    pub fn state(&self) -> AgentState {
        if self.current_state != AgentState::Idle
            && self.last_activity.elapsed() >= self.idle_timeout
        {
            AgentState::Idle
        } else {
            self.current_state
        }
    }
}

impl Default for ClaudeStateDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_thinking() {
        let mut d = ClaudeStateDetector::new();
        let s = d.feed("Thinking...");
        assert_eq!(s, AgentState::Thinking);
        assert_eq!(s.label(), "Thinking");
    }

    #[test]
    fn test_detect_writing() {
        let mut d = ClaudeStateDetector::new();
        let s = d.feed("Edit(src/main.rs)");
        assert_eq!(s, AgentState::Writing);
        assert_eq!(s.label(), "Writing");
    }

    #[test]
    fn test_detect_running() {
        let mut d = ClaudeStateDetector::new();
        let s = d.feed("Bash(ls -la)");
        assert_eq!(s, AgentState::Running);
        assert_eq!(s.label(), "Running");
    }

    #[test]
    fn test_detect_reading() {
        let mut d = ClaudeStateDetector::new();
        let s = d.feed("Read(Cargo.toml)");
        assert_eq!(s, AgentState::Reading);
        assert_eq!(s.label(), "Reading");
    }

    #[test]
    fn test_detect_waiting() {
        let mut d = ClaudeStateDetector::new();
        let s = d.feed("Claude wants to run Bash");
        assert_eq!(s, AgentState::Waiting);
        assert_eq!(s.label(), "Waiting for input");
    }

    #[test]
    fn test_detect_error() {
        let mut d = ClaudeStateDetector::new();
        let s = d.feed("Error: something broke");
        assert_eq!(s, AgentState::Error);
        assert_eq!(s.label(), "Error");
    }

    #[test]
    fn test_strips_ansi() {
        let mut d = ClaudeStateDetector::new();
        // "\x1B[32mThinking\x1B[0m" should strip to "Thinking"
        let s = d.feed("\x1B[32mThinking\x1B[0m");
        assert_eq!(s, AgentState::Thinking);
    }

    #[test]
    fn test_braille_spinner() {
        let mut d = ClaudeStateDetector::new();
        let s = d.feed("\u{2840}\u{2844}");
        assert_eq!(s, AgentState::Thinking);
    }

    #[test]
    fn test_priority_upgrade() {
        let mut d = ClaudeStateDetector::new();
        // Feed Reading first
        let s1 = d.feed("Read(Cargo.toml)");
        assert_eq!(s1, AgentState::Reading);
        // Then feed Writing -- Writing (priority 4) > Reading (priority 2), should upgrade
        let s2 = d.feed("Edit(src/main.rs)");
        assert_eq!(s2, AgentState::Writing);
    }
}
