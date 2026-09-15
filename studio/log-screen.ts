// Журнал диалога — то, что терминал ПОКАЗАЛ, а не поток байтов (S3, блок 5). TUI claude перерисовывает приглашение и
// спиннер на месте: курсор вверх, стереть строку, возврат каретки. Простое снятие ANSI оставляло в журнале каждый кадр
// каждой перерисовки. Здесь — экран строк: последние `rows` строк ещё могут измениться, строка, ушедшая выше экрана, уже
// окончательна и уходит в журнал; подряд идущие дубли, строки из одного значка спиннера и лишние пустые строки выпадают,
// а полный перевывод разговора после очистки экрана (claude так перерисовывает длинную историю) не повторяется.

const SPINNER_ONLY = /^[\s✶✻✽✢✳·*⏺●○◐◓◑◒⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|/\\-]*$/;
const HISTORY = 20_000;

export class LogScreen {
  private lines: string[] = [""];
  private row = 0;
  private col = 0;
  private saved: [number, number] = [0, 0];
  /** An escape sequence cut between two chunks of the pty. */
  private pending = "";
  private lastOut: string | null = null;
  private blank = false;
  /** Lines already in the journal: a redraw of the whole conversation after a clear is matched against them and skipped. */
  private history: string[] = [];
  private replay = -1;
  private cols: number;
  private rows: number;
  private out: (text: string) => void;

  constructor(cols: number, rows: number, out: (text: string) => void) {
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
    this.out = out;
  }

  resize(cols: number, rows: number): void {
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
  }

  private get top(): number {
    return Math.max(0, this.lines.length - this.rows);
  }

  private ensure(): void {
    while (this.lines.length <= this.row) this.lines.push("");
  }

  private put(ch: string): void {
    if (this.col >= this.cols) {
      this.row++;
      this.col = 0;
    }
    this.ensure();
    const line = this.lines[this.row] as string;
    const padded = line.length < this.col ? line + " ".repeat(this.col - line.length) : line;
    this.lines[this.row] = padded.slice(0, this.col) + ch + padded.slice(this.col + 1);
    this.col++;
  }

  private csi(prefix: string, params: string, final: string): void {
    if (prefix) return; // private modes: ?25l, ?2026h, >4m …
    const nums = params.split(";").map((v) => (v === "" ? NaN : Number(v)));
    const n = Number.isFinite(nums[0]) ? (nums[0] as number) : 0;
    const one = Math.max(1, n);
    switch (final) {
      case "A":
        this.row = Math.max(this.top, this.row - one);
        break;
      case "B":
        this.row += one;
        this.ensure();
        break;
      case "C":
        this.col += one;
        break;
      case "D":
        this.col = Math.max(0, this.col - one);
        break;
      case "E":
      case "F":
        this.row = final === "E" ? this.row + one : Math.max(this.top, this.row - one);
        this.col = 0;
        this.ensure();
        break;
      case "G":
        this.col = one - 1;
        break;
      case "H":
      case "f": {
        const r = Number.isFinite(nums[0]) ? Math.max(1, nums[0] as number) : 1;
        const c = Number.isFinite(nums[1]) ? Math.max(1, nums[1] as number) : 1;
        this.row = this.top + r - 1;
        this.col = c - 1;
        this.ensure();
        break;
      }
      case "K": {
        const line = this.lines[this.row] ?? "";
        this.lines[this.row] = n === 2 ? "" : n === 1 ? " ".repeat(Math.min(line.length, this.col + 1)) + line.slice(this.col + 1) : line.slice(0, this.col);
        break;
      }
      case "J":
        if (n === 0) {
          this.lines[this.row] = (this.lines[this.row] ?? "").slice(0, this.col);
          this.lines.length = this.row + 1;
        } else {
          // the whole screen (2) or with the scrollback (3): what follows may be the conversation printed again
          this.lines.length = this.top;
          this.lines.push("");
          this.row = this.lines.length - 1;
          this.col = 0;
          if (n === 3 || n === 2) this.replay = 0;
        }
        break;
      default:
        break; // colours (m) and the rest do not move text
    }
  }

  write(data: string): void {
    const s = this.pending + data;
    this.pending = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i] as string;
      if (ch === "\x1b") {
        const rest = s.slice(i);
        const csi = /^\x1b\[([?>=<]?)([0-9;:]*)[ -/]*([@-~])/.exec(rest);
        if (csi) {
          this.csi(csi[1] as string, (csi[2] as string).replace(/:/g, ";"), csi[3] as string);
          i += csi[0].length - 1;
          continue;
        }
        const osc = /^\x1b\][^\x07\x1b]*(\x07|\x1b\\)/.exec(rest);
        if (osc) {
          i += osc[0].length - 1;
          continue;
        }
        if (/^\x1b(\[[?>=<]?[0-9;:]*[ -/]*|\][^\x07\x1b]*|[()#%]?)$/.test(rest)) {
          this.pending = rest;
          break;
        }
        if (rest[1] === "7") this.saved = [this.row, this.col];
        else if (rest[1] === "8") {
          [this.row, this.col] = this.saved;
          this.row = Math.max(this.top, Math.min(this.row, this.lines.length - 1));
        }
        i += /[()#%]/.test(rest[1] ?? "") ? 2 : 1;
        continue;
      }
      if (ch === "\r") this.col = 0;
      else if (ch === "\n") {
        this.row++;
        this.col = 0;
        this.ensure();
      } else if (ch === "\b") this.col = Math.max(0, this.col - 1);
      else if (ch === "\t") this.col = Math.min(this.cols, (Math.floor(this.col / 8) + 1) * 8);
      else if (ch >= " ") this.put(ch);
    }
    this.scroll();
  }

  /** Lines above the screen can no longer change: into the journal. */
  private scroll(): void {
    const k = Math.min(this.top, this.row);
    if (k <= 0) return;
    for (const line of this.lines.splice(0, k)) this.emit(line);
    this.row -= k;
    this.saved = [Math.max(0, this.saved[0] - k), this.saved[1]];
  }

  private emit(raw: string): void {
    const line = raw.replace(/\s+$/, "");
    if (SPINNER_ONLY.test(line) && line.trim()) return;
    if (!line) {
      if (this.blank) return;
      this.blank = true;
    } else this.blank = false;
    if (this.replay >= 0 && line) {
      // a redraw after a clear: while it repeats the journal line by line, nothing new is said
      const at = this.history.indexOf(line, this.replay);
      if (at >= 0 && at - this.replay < 3) {
        this.replay = at + 1;
        return;
      }
      this.replay = -1;
    }
    if (line && line === this.lastOut) return;
    if (line) {
      this.lastOut = line;
      this.history.push(line);
      if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY);
    }
    this.out(line + "\n");
  }

  /** The dialog is over: the screen itself goes into the journal. */
  end(): void {
    for (const line of this.lines.splice(0)) this.emit(line);
    this.lines = [""];
    this.row = 0;
    this.col = 0;
  }
}
