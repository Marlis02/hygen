import { render } from "preact";
import "../style.css";
import { App } from "./app.tsx";
import { loadStrings, t } from "./lib/i18n.ts";
import { startLive } from "./lib/live.ts";

void loadStrings().then(() => {
  document.title = t("app.title");
  startLive();
  render(<App />, document.getElementById("root") as HTMLElement);
});
