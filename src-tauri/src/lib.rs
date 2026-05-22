use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

async fn run_sidecar(
    app: &AppHandle,
    text: &str,
    voice: &str,
    rate: &str,
    pitch: &str,
    out: &str,
) -> Result<(), String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_path = app
        .path()
        .temp_dir()
        .map_err(|e| format!("임시 디렉토리 접근 실패: {e}"))?
        .join(format!("voxsave_input_{nanos}.txt"));

    fs::write(&tmp_path, text).map_err(|e| format!("임시 파일 쓰기 실패: {e}"))?;
    let tmp_str = tmp_path.to_string_lossy().to_string();

    let result = app
        .shell()
        .sidecar("edge-tts-sidecar")
        .map_err(|e| format!("사이드카 핸들 생성 실패: {e}"))?
        .args([
            "--textfile", &tmp_str,
            "--voice", voice,
            "--rate", rate,
            "--pitch", pitch,
            "--out", out,
        ])
        .output()
        .await
        .map_err(|e| format!("사이드카 실행 실패: {e}"))?;

    let _ = fs::remove_file(&tmp_path);

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr).to_string();
        let code = result.status.code().unwrap_or(-1);
        return Err(format!("edge-tts 종료코드 {code}\nstderr: {stderr}"));
    }
    Ok(())
}

#[tauri::command]
async fn synthesize(
    app: AppHandle,
    text: String,
    voice: String,
    rate: String,
    pitch: String,
    out: String,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("입력 텍스트가 비어 있습니다.".into());
    }
    if out.trim().is_empty() {
        return Err("저장 경로가 지정되지 않았습니다.".into());
    }
    run_sidecar(&app, &text, &voice, &rate, &pitch, &out).await?;
    Ok(out)
}

#[tauri::command]
async fn preview(
    app: AppHandle,
    text: String,
    voice: String,
    rate: String,
    pitch: String,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("입력 텍스트가 비어 있습니다.".into());
    }

    let preview_text: String = text.chars().take(300).collect();

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let out_path = app
        .path()
        .temp_dir()
        .map_err(|e| format!("임시 디렉토리 접근 실패: {e}"))?
        .join(format!("voxsave_preview_{nanos}.mp3"));
    let out_str = out_path.to_string_lossy().to_string();

    run_sidecar(&app, &preview_text, &voice, &rate, &pitch, &out_str).await?;

    let bytes = fs::read(&out_path).map_err(|e| format!("미리듣기 파일 읽기 실패: {e}"))?;
    let _ = fs::remove_file(&out_path);

    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![synthesize, preview])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
