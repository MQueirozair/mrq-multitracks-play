//! Erros estruturados do formato `.mrq`. Nunca devolvidos como `String`
//! solta pro frontend — cada variante carrega um `kind` (discriminador) +
//! os campos relevantes, serializados como JSON, pra o lado TypeScript
//! poder tratar cada caso (`if (err.kind === 'hashMismatchSample')`) sem
//! parsing de texto nem heurística de mensagem.

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind")]
pub enum MrqError {
    #[serde(rename = "io")]
    Io { message: String },

    #[serde(rename = "invalidMagic")]
    InvalidMagic,

    #[serde(rename = "unsupportedVersion")]
    UnsupportedVersion { found: u32, expected: u32 },

    #[serde(rename = "truncated")]
    Truncated {
        #[serde(rename = "neededAtLeast")]
        needed_at_least: u64,
        available: u64,
    },

    #[serde(rename = "metadataLenExceedsFile")]
    MetadataLenExceedsFile {
        declared: u64,
        #[serde(rename = "maxAllowed")]
        max_allowed: u64,
    },

    #[serde(rename = "invalidMetadataJson")]
    InvalidMetadataJson { message: String },

    #[serde(rename = "offsetOutOfBounds")]
    OffsetOutOfBounds {
        #[serde(rename = "sampleId")]
        sample_id: String,
    },

    #[serde(rename = "sizeOverflow")]
    SizeOverflow {
        #[serde(rename = "sampleId")]
        sample_id: String,
    },

    #[serde(rename = "sampleNotFound")]
    SampleNotFound {
        #[serde(rename = "sampleId")]
        sample_id: String,
    },

    #[serde(rename = "danglingSampleReference")]
    DanglingSampleReference {
        #[serde(rename = "sampleId")]
        sample_id: String,
    },

    #[serde(rename = "hashMismatchSample")]
    HashMismatchSample {
        #[serde(rename = "sampleId")]
        sample_id: String,
    },

    // `HashMismatchGlobal` e `Other` (abaixo) fazem parte do contrato
    // estruturado exposto ao frontend (TS já trata esses `kind`), mas hoje
    // nenhum caminho de código os constrói diretamente: o hash global
    // incorreto é reportado como dado em `MrqIntegrityReport.global_ok`
    // (não como erro), e `Other` é reservado pra uso futuro. Mantidos de
    // propósito — não é código morto a remover.
    #[allow(dead_code)]
    #[serde(rename = "hashMismatchGlobal")]
    HashMismatchGlobal,

    #[serde(rename = "sessionNotFound")]
    SessionNotFound {
        #[serde(rename = "sessionId")]
        session_id: String,
    },

    #[serde(rename = "invalidSampleParams")]
    InvalidSampleParams { message: String },

    #[serde(rename = "encodeError")]
    EncodeError { message: String },

    #[serde(rename = "decodeError")]
    DecodeError { message: String },

    #[serde(rename = "selfValidationFailed")]
    SelfValidationFailed { message: String },

    #[allow(dead_code)]
    #[serde(rename = "other")]
    Other { message: String },
}

impl std::fmt::Display for MrqError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MrqError::Io { message } => write!(f, "erro de E/S: {message}"),
            MrqError::InvalidMagic => write!(f, "assinatura .mrq inválida (esperado \"MRQ1\")"),
            MrqError::UnsupportedVersion { found, expected } => {
                write!(f, "versão de formato .mrq não suportada: {found} (suportada: {expected})")
            }
            MrqError::Truncated { needed_at_least, available } => write!(
                f,
                "arquivo .mrq truncado: precisa de pelo menos {needed_at_least} bytes, tem {available}"
            ),
            MrqError::MetadataLenExceedsFile { declared, max_allowed } => write!(
                f,
                "tamanho de metadados declarado ({declared} bytes) excede o limite/arquivo (máx. {max_allowed})"
            ),
            MrqError::InvalidMetadataJson { message } => write!(f, "metadados .mrq inválidos: {message}"),
            MrqError::OffsetOutOfBounds { sample_id } => {
                write!(f, "offset/tamanho fora dos limites do arquivo para a amostra '{sample_id}'")
            }
            MrqError::SizeOverflow { sample_id } => {
                write!(f, "estouro de inteiro ao calcular offsets da amostra '{sample_id}'")
            }
            MrqError::SampleNotFound { sample_id } => write!(f, "amostra '{sample_id}' não encontrada no índice"),
            MrqError::DanglingSampleReference { sample_id } => write!(
                f,
                "zona referencia a amostra '{sample_id}', que nunca foi adicionada à sessão"
            ),
            MrqError::HashMismatchSample { sample_id } => {
                write!(f, "SHA-256 da amostra '{sample_id}' não confere com o índice")
            }
            MrqError::HashMismatchGlobal => write!(f, "SHA-256 global do arquivo não confere"),
            MrqError::SessionNotFound { session_id } => write!(f, "sessão de conversão '{session_id}' não encontrada"),
            MrqError::InvalidSampleParams { message } => write!(f, "parâmetros de amostra inválidos: {message}"),
            MrqError::EncodeError { message } => write!(f, "falha ao codificar FLAC: {message}"),
            MrqError::DecodeError { message } => write!(f, "falha ao decodificar FLAC: {message}"),
            MrqError::SelfValidationFailed { message } => {
                write!(f, "o arquivo .mrq recém-gerado falhou na autovalidação antes da gravação final: {message}")
            }
            MrqError::Other { message } => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for MrqError {}

impl From<std::io::Error> for MrqError {
    fn from(e: std::io::Error) -> Self {
        MrqError::Io { message: e.to_string() }
    }
}
