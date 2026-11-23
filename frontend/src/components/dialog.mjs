// In-page dialogs instead of the browser's confirm() and prompt() (docs/DESIGN.md 4.7): a native <dialog> opened with showModal(), so the page behind is
// inert, Esc cancels, focus stays inside and goes back to what had it. Promise based, plain DOM (the editor uses it too, outside React).
// The texts are given already translated by the caller (they are put together there); the buttons' own words are translated here.
import { t } from "../i18n/index.mjs";

/**
 * @param {{title?: string, message?: string, fields?: {label: string, value?: string, maxLength?: number, multiline?: boolean}[], confirm?: string, cancel?: string, danger?: boolean}} o
 * @returns {Promise<string[] | null>} the values of the fields (an empty list for a plain question) when confirmed, else null
 */
function show(o) {
  return new Promise(resolve => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg";
    const form = document.createElement("form");
    form.method = "dialog";
    if (o.title) { const h = document.createElement("h3"); h.textContent = o.title; form.append(h); }
    if (o.message) { const p = document.createElement("p"); p.className = "dlg-msg"; p.textContent = o.message; form.append(p); }
    const inputs = [];
    for (const f of o.fields || []) {
      const label = document.createElement("label"), span = document.createElement("span");
      span.textContent = f.label;
      const input = f.multiline ? document.createElement("textarea") : document.createElement("input");
      if (!f.multiline) input.type = "text";
      else input.rows = 3;
      input.value = f.value ?? "";
      if (f.maxLength) input.maxLength = f.maxLength;
      input.setAttribute("translate", "no");
      label.append(span, input);
      form.append(label);
      inputs.push(input);
    }
    const bar = document.createElement("div");
    bar.className = "dlg-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = o.cancel || t("Cancel");
    const ok = document.createElement("button");
    ok.type = "submit";
    ok.className = "primary";
    ok.textContent = o.confirm || t("OK");
    bar.append(cancel, ok);
    form.append(bar);
    dlg.append(form);
    let answer = null;
    cancel.addEventListener("click", () => dlg.close());
    form.addEventListener("submit", () => { answer = inputs.map(i => i.value); });
    // a click on the dark area outside the box cancels
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => { dlg.remove(); resolve(answer); });
    document.body.append(dlg);
    dlg.showModal();
    // a question puts the cursor on the safe choice (Cancel) when it deletes, else on the answer; a form on its first field
    if (inputs[0]) { inputs[0].focus(); inputs[0].select(); } else (o.danger ? cancel : ok).focus();
  });
}

/** "Delete X?": true when the person confirmed. danger makes Cancel the button with focus, so Enter does not delete. */
export async function confirmDialog(message, { title = "", confirm = "", danger = false } = {}) {
  return (await show({ title, message, confirm, danger })) !== null;
}

/** A question with one text field: the text, or null when cancelled. */
export async function promptDialog(label, value = "", { title = "", confirm = "", maxLength = 0 } = {}) {
  const r = await show({ title, fields: [{ label, value, maxLength }], confirm });
  return r ? r[0] : null;
}

/** Several fields: their values in order, or null when cancelled. */
export async function formDialog({ title = "", fields = [], confirm = "" } = {}) {
  return show({ title, fields, confirm });
}
