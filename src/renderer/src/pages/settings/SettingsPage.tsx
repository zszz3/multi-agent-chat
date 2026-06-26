import type { Language } from "../../app/language";

interface SettingsPageProps {
  language: Language;
  keepAwake?: boolean;
  onLanguageChange: (language: Language) => void;
  onKeepAwakeChange?: (enabled: boolean) => void;
}

export function SettingsPage({ language, keepAwake = false, onLanguageChange, onKeepAwakeChange }: SettingsPageProps) {
  const configText =
    language === "zh"
      ? { language: "界面语言", zh: "统一中文", en: "English" }
      : { language: "Language", zh: "统一中文", en: "English" };
  const title = language === "zh" ? "设置" : "Settings";
  const description = language === "zh" ? "调整应用级偏好。" : "Adjust app-level preferences.";
  const languageTitle = language === "zh" ? "语言" : "Language";
  const languageDescription = language === "zh" ? "选择界面显示语言。" : "Choose the interface language.";
  const powerTitle = language === "zh" ? "定时任务" : "Scheduled tasks";
  const powerDescription =
    language === "zh"
      ? "本地 App 在线等待远程定时任务时，可阻止系统自动进入休眠。"
      : "Prevent automatic sleep while the local app waits for remote scheduled tasks.";
  const keepAwakeTitle = language === "zh" ? "保持唤醒" : "Keep awake";
  const keepAwakeDescription =
    language === "zh"
      ? "只阻止自动休眠，不点亮屏幕；手动合盖、关机或断网仍会中断本地执行。"
      : "Prevents idle sleep without forcing the display on; closing the lid, shutdown, or network loss still interrupts local execution.";

  return (
    <section className="settings-page">
      <header className="settings-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="settings-layout">
        <section className="settings-panel" aria-label={languageTitle}>
          <div className="settings-panel-head">
            <h3>{languageTitle}</h3>
            <p>{languageDescription}</p>
          </div>
          <label className="settings-language-select">
            <span>{configText.language}</span>
            <select aria-label="Language" value={language} onChange={(event) => onLanguageChange(event.currentTarget.value as Language)}>
              <option value="zh">{configText.zh}</option>
              <option value="en">{configText.en}</option>
            </select>
          </label>
        </section>
        <section className="settings-panel" aria-label={powerTitle}>
          <div className="settings-panel-head">
            <h3>{powerTitle}</h3>
            <p>{powerDescription}</p>
          </div>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              aria-label="Keep awake for scheduled tasks"
              checked={keepAwake}
              onChange={(event) => onKeepAwakeChange?.(event.currentTarget.checked)}
            />
            <span>
              <strong>{keepAwakeTitle}</strong>
              <small>{keepAwakeDescription}</small>
            </span>
          </label>
        </section>
      </div>
    </section>
  );
}
