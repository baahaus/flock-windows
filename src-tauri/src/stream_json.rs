use serde_json::Value;

#[derive(Debug, PartialEq)]
pub enum StreamEvent {
    Init { session_id: String, model: String },
    Thinking(String),
    Text(String),
    ToolUse { name: String, input: String },
    ToolResult(String),
    Result {
        is_error: bool,
        text: Option<String>,
        cost_usd: Option<f64>,
    },
}

pub struct StreamJsonParser {
    pub buffer: String,
    pub max_buffer: usize,
}

impl Default for StreamJsonParser {
    fn default() -> Self {
        Self::new()
    }
}

impl StreamJsonParser {
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            max_buffer: 10 * 1024 * 1024,
        }
    }

    pub fn feed(&mut self, data: &str) -> Vec<StreamEvent> {
        self.buffer.push_str(data);

        if self.buffer.len() > self.max_buffer {
            self.buffer.clear();
            return Vec::new();
        }

        let mut events = Vec::new();

        // Process all complete lines (ending with \n)
        while let Some(newline_pos) = self.buffer.find('\n') {
            let line = self.buffer[..newline_pos].trim().to_string();
            self.buffer.drain(..=newline_pos);

            if line.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<Value>(&line) {
                let parsed = Self::parse_event(&json);
                events.extend(parsed);
            }
        }

        events
    }

    fn parse_event(json: &Value) -> Vec<StreamEvent> {
        let event_type = match json.get("type").and_then(|v| v.as_str()) {
            Some(t) => t,
            None => return Vec::new(),
        };

        match event_type {
            "system" => {
                let subtype = json.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
                if subtype == "init" {
                    let session_id = json
                        .get("session_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let model = json
                        .get("model")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    vec![StreamEvent::Init { session_id, model }]
                } else {
                    Vec::new()
                }
            }

            "assistant" => {
                let content = match json
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())
                {
                    Some(arr) => arr,
                    None => return Vec::new(),
                };

                let mut events = Vec::new();
                for block in content {
                    let block_type = match block.get("type").and_then(|v| v.as_str()) {
                        Some(t) => t,
                        None => continue,
                    };

                    match block_type {
                        "text" => {
                            let text = block
                                .get("text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            events.push(StreamEvent::Text(text));
                        }
                        "thinking" => {
                            let thinking = block
                                .get("thinking")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            events.push(StreamEvent::Thinking(thinking));
                        }
                        "tool_use" => {
                            let name = block
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let input = block
                                .get("input")
                                .map(|v| v.to_string())
                                .unwrap_or_else(|| "{}".to_string());
                            events.push(StreamEvent::ToolUse { name, input });
                        }
                        "tool_result" => {
                            let result_text = block
                                .get("content")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            events.push(StreamEvent::ToolResult(result_text));
                        }
                        _ => {}
                    }
                }
                events
            }

            "result" => {
                let is_error = json
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let text = json
                    .get("result")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let cost_usd = json
                    .get("cost_usd")
                    .and_then(|v| v.as_f64());
                vec![StreamEvent::Result {
                    is_error,
                    text,
                    cost_usd,
                }]
            }

            _ => Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_init() {
        let mut parser = StreamJsonParser::new();

        // Feed without trailing newline -- should produce no events yet
        let events = parser.feed(r#"{"type":"system","subtype":"init","session_id":"abc123","model":"claude-opus-4-5"}"#);
        assert!(events.is_empty(), "No events without newline");

        // Feed the newline -- should now produce the Init event
        let events = parser.feed("\n");
        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0],
            StreamEvent::Init {
                session_id: "abc123".to_string(),
                model: "claude-opus-4-5".to_string(),
            }
        );
    }

    #[test]
    fn test_parse_text() {
        let mut parser = StreamJsonParser::new();
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Hello, world!"}]}}"# ;
        let events = parser.feed(&format!("{}\n", line));
        assert_eq!(events.len(), 1);
        assert_eq!(events[0], StreamEvent::Text("Hello, world!".to_string()));
    }

    #[test]
    fn test_parse_tool_use() {
        let mut parser = StreamJsonParser::new();
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"bash","input":{"command":"ls -la"}}]}}"#;
        let events = parser.feed(&format!("{}\n", line));
        assert_eq!(events.len(), 1);
        match &events[0] {
            StreamEvent::ToolUse { name, input } => {
                assert_eq!(name, "bash");
                // input should be the JSON-stringified input object
                let parsed: serde_json::Value = serde_json::from_str(input).unwrap();
                assert_eq!(parsed["command"], "ls -la");
            }
            other => panic!("Expected ToolUse, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_result() {
        let mut parser = StreamJsonParser::new();
        let line = r#"{"type":"result","is_error":false,"result":"Done","cost_usd":0.0042}"#;
        let events = parser.feed(&format!("{}\n", line));
        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0],
            StreamEvent::Result {
                is_error: false,
                text: Some("Done".to_string()),
                cost_usd: Some(0.0042),
            }
        );
    }

    #[test]
    fn test_multiple_lines() {
        let mut parser = StreamJsonParser::new();
        let input = concat!(
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"First"}]}}"#,
            "\n",
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Second"}]}}"#,
            "\n"
        );
        let events = parser.feed(input);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0], StreamEvent::Text("First".to_string()));
        assert_eq!(events[1], StreamEvent::Text("Second".to_string()));
    }

    #[test]
    fn test_buffer_overflow_resets() {
        let mut parser = StreamJsonParser::new();
        parser.max_buffer = 10; // very small limit

        // Feed more than 10 bytes without a newline -- should overflow and clear
        let events = parser.feed("this is more than ten bytes of data");
        assert!(events.is_empty(), "Expected no events on overflow");
        assert!(parser.buffer.is_empty(), "Buffer should be cleared after overflow");
    }
}
