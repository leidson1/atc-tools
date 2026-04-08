use serde::Serialize;
use std::fmt;

#[derive(Debug, Serialize)]
pub enum AppError {
    Api(String),
    Network(String),
    Parse(String),
    NotFound(String),
    Cache(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Api(msg) => write!(f, "API Error: {}", msg),
            AppError::Network(msg) => write!(f, "Network Error: {}", msg),
            AppError::Parse(msg) => write!(f, "Parse Error: {}", msg),
            AppError::NotFound(msg) => write!(f, "Not Found: {}", msg),
            AppError::Cache(msg) => write!(f, "Cache Error: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

impl From<quick_xml::DeError> for AppError {
    fn from(e: quick_xml::DeError) -> Self {
        AppError::Parse(e.to_string())
    }
}
