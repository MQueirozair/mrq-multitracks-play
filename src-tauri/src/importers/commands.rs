//! Comandos Tauri do importador SF2/SF3 (Fase 3). Finos de propósito, igual
//! ao padrão de `crate::mrq::commands`: toda a lógica real mora em
//! `sf2.rs`; aqui só se converte `String` em `PathBuf`, se encaminha pro
//! `State` gerenciado, e se agrega o resultado + relatório de
//! compatibilidade numa resposta serializável. Erro sempre estruturado
//! (`ImportError`, com `kind`) — nunca uma `String` solta.

use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::mrq::model::{MrqCompatibilityReport, MrqFinishResult, MrqInstrumentModel};
use crate::mrq::writer::MrqBuilderState;

use super::errors::ImportError;
use super::sf2;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf2InspectionResult {
    pub instrument: MrqInstrumentModel,
    pub compatibility: MrqCompatibilityReport,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf2ConversionResult {
    pub finish: MrqFinishResult,
    pub compatibility: MrqCompatibilityReport,
}

/// Faz só o parsing estrutural do SF2/SF3 (presets/grupos/zonas/generators
/// → `MrqInstrumentModel`) e devolve junto o relatório de compatibilidade
/// — sem decodificar nenhum áudio. Pensado pra alimentar uma futura tela de
/// inspeção/preview antes do usuário confirmar a conversão completa.
#[tauri::command]
pub fn mrq_inspect_sf2(path: String) -> Result<Sf2InspectionResult, ImportError> {
    let inspection = sf2::inspect(&PathBuf::from(path))?;
    Ok(Sf2InspectionResult { instrument: inspection.instrument, compatibility: inspection.compatibility })
}

/// Converte um arquivo SF2/SF3 inteiro (estrutura + áudio) pra um `.mrq`
/// gravado em `dest_path`, reaproveitando o backend `.mrq` da Fase 2
/// (`mrq_builder_begin`/`add_sample`/`finish`, chamados internamente em
/// sequência — o frontend não precisa orquestrar essas etapas pra
/// importações SF2/SF3). Roda inteiramente no processo Rust.
#[tauri::command]
pub fn mrq_convert_sf2_to_mrq(
    state: State<'_, MrqBuilderState>,
    source_path: String,
    dest_path: String,
) -> Result<Sf2ConversionResult, ImportError> {
    let (finish, compatibility) = sf2::convert_to_mrq(&state, &PathBuf::from(source_path), PathBuf::from(dest_path))?;
    Ok(Sf2ConversionResult { finish, compatibility })
}
