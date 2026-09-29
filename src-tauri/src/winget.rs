// Available app updates via winget. `winget upgrade` has no JSON output, so
// we parse its fixed-width table: column starts come from the header line
// (whatever language it's in), row cells are sliced at those positions.

use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WingetUpgrade {
    pub name: String,
    pub id: String,
    pub version: String,
    pub available: String,
    pub source: String,
}

// Error codes the UI maps to translated messages.
pub const ERR_MISSING: &str = "winget-missing";
pub const ERR_TIMEOUT: &str = "timeout";
pub const ERR_FAILED: &str = "failed";

fn run(args: &[&str], timeout: Duration) -> Result<(i32, String), String> {
    let mut cmd = Command::new("winget");
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|_| ERR_MISSING.to_string())?;

    // Drain stdout on its own thread so a full pipe can't stall the child.
    let mut stdout = child.stdout.take().ok_or(ERR_FAILED)?;
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });

    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) if start.elapsed() > timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(ERR_TIMEOUT.into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(200)),
            Err(_) => return Err(ERR_FAILED.into()),
        }
    };
    let out = reader.join().unwrap_or_default();
    Ok((status.code().unwrap_or(-1), String::from_utf8_lossy(&out).into_owned()))
}

// Display width of a cell: winget pads by terminal columns, so wide (CJK)
// characters take two.
fn width(c: char) -> usize {
    match c as u32 {
        0x1100..=0x115F | 0x2E80..=0xA4CF | 0xAC00..=0xD7A3 | 0xF900..=0xFAFF
        | 0xFE30..=0xFE4F | 0xFF00..=0xFF60 | 0xFFE0..=0xFFE6 => 2,
        _ => 1,
    }
}

// Slice a line by display columns rather than bytes or chars. Returns None
// when text runs across a column boundary — real rows always have a space
// before every column, while sentences (localized footers) don't.
fn cells(line: &str, starts: &[usize]) -> Option<Vec<String>> {
    let mut out = vec![String::new(); starts.len()];
    let mut col = 0;
    let mut prev_space = true;
    for c in line.chars() {
        if col > 0 && starts.contains(&col) && !prev_space {
            return None;
        }
        let idx = starts.iter().rposition(|&s| col >= s).unwrap_or(0);
        out[idx].push(c);
        prev_space = c.is_whitespace();
        col += width(c);
    }
    Some(out.into_iter().map(|s| s.trim().to_string()).collect())
}

fn header_starts(header: &str) -> Vec<usize> {
    let mut starts = Vec::new();
    let mut col = 0;
    let mut prev_space = true;
    for c in header.chars() {
        let space = c.is_whitespace();
        if !space && prev_space {
            starts.push(col);
        }
        prev_space = space;
        col += width(c);
    }
    starts
}

pub fn parse(output: &str) -> Vec<WingetUpgrade> {
    // winget draws a spinner with '\r' before the table; keep only what's
    // left after the last carriage return on each line (after dropping the
    // CRLF line ending it uses when there's no console).
    let lines: Vec<&str> = output
        .split('\n')
        .map(|l| {
            let l = l.strip_suffix('\r').unwrap_or(l);
            l.rsplit('\r').next().unwrap_or(l)
        })
        .collect();

    let mut out = Vec::new();
    let mut starts: Option<Vec<usize>> = None;
    for (i, line) in lines.iter().enumerate() {
        let is_rule = line.len() > 10 && line.trim().chars().all(|c| c == '-');
        if is_rule {
            starts = i
                .checked_sub(1)
                .map(|h| header_starts(lines[h]))
                .filter(|s| s.len() >= 4);
            continue;
        }
        let Some(s) = &starts else { continue };
        if line.trim().is_empty() {
            starts = None;
            continue;
        }
        let Some(c) = cells(line, s) else {
            starts = None;
            continue;
        };
        let (name, id, version, available) = (&c[0], &c[1], &c[2], &c[3]);
        // Footer lines ("38 upgrades available.") land entirely in the first
        // column; real rows always have an id and an available version.
        if id.is_empty() || available.is_empty() || id.contains(' ') {
            starts = None;
            continue;
        }
        out.push(WingetUpgrade {
            name: name.clone(),
            id: id.clone(),
            version: version.clone(),
            available: available.clone(),
            source: c.get(4).cloned().unwrap_or_default(),
        });
    }
    out
}

pub fn list() -> Result<Vec<WingetUpgrade>, String> {
    let (_, out) = run(
        &["upgrade", "--accept-source-agreements", "--disable-interactivity"],
        Duration::from_secs(120),
    )?;
    Ok(parse(&out))
}

pub fn upgrade(id: &str) -> Result<(), String> {
    let (code, _) = run(
        &[
            "upgrade",
            "--id",
            id,
            "--exact",
            "--silent",
            "--accept-package-agreements",
            "--accept-source-agreements",
            "--disable-interactivity",
        ],
        Duration::from_secs(15 * 60),
    )?;
    if code == 0 {
        Ok(())
    } else {
        Err(ERR_FAILED.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "   - \r   \\ \r                                                                                                                        \r\
Name                                                         Id                                      Version                      Available               Source\n\
----------------------------------------------------------------------------------------------------------------------------------------------------------------\n\
Apple Mobile Device Support                                  Apple.AppleMobileDeviceSupport          14.5.0.7                     19.4.0.10               winget\n\
Microsoft Windows Desktop Runtime - 10.0.0 Preview 3 (x64)   Microsoft.DotNet.DesktopRuntime.Preview < 10.0.0-preview.4.25258.110 11.0.0-rc.1.26425.128   winget\n\
Spotify                                                      Spotify.Spotify                         1.2.98.301.gfcaeba72         1.3.1.234.g59d6bf59     winget\n\
38 upgrades available.\n\
\n\
The following packages have an upgrade available, but require explicit targeting for upgrade:\n\
Name     Id              Version Available Source\n\
-------------------------------------------------\n\
Discord  Discord.Discord 1.0.1   1.0.2     winget\n";

    #[test]
    fn parses_rows_and_skips_noise() {
        let rows = parse(SAMPLE);
        let ids: Vec<&str> = rows.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "Apple.AppleMobileDeviceSupport",
                "Microsoft.DotNet.DesktopRuntime.Preview",
                "Spotify.Spotify",
                "Discord.Discord"
            ]
        );
        assert_eq!(rows[0].name, "Apple Mobile Device Support");
        assert_eq!(rows[1].version, "< 10.0.0-preview.4.25258.110");
        assert_eq!(rows[1].available, "11.0.0-rc.1.26425.128");
        assert_eq!(rows[2].source, "winget");
        assert_eq!(parse(&SAMPLE.replace('\n', "\r\n")), rows);
    }

    #[test]
    fn localized_header_and_no_updates() {
        let de = "Name   ID          Version Verfügbar Quelle\n\
--------------------------------------------\n\
7-Zip  7zip.7zip   23.01   24.08     winget\n\
1 Aktualisierungen verfügbar.\n\
Keine weiteren Pakete mit verfügbaren Aktualisierungen gefunden.\n";
        let rows = parse(de);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].available, "24.08");
        assert!(parse("No installed package found matching input criteria.\n").is_empty());
    }
}
