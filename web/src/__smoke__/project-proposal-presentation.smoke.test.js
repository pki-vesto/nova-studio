const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function byText(root, text, selector = "*") {
  const needle = normalize(text);
  return Array.from(root.querySelectorAll(selector)).find((el) => normalize(el.textContent).includes(needle));
}

async function waitFor(check, label) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < 2500) {
    try {
      const result = check();
      if (result) return result;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw lastError || new Error(`Timed out waiting for ${label}`);
}

function click(el) {
  assert.ok(el, "expected element to click");
  el.click();
}

function setInputValue(input, value) {
  assert.ok(input, "expected input");
  const valueSetter = Object.getOwnPropertyDescriptor(input, "value")?.set;
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) prototypeValueSetter.call(input, value);
  else if (valueSetter) valueSetter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new window.InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function createApiStub() {
  const state = {
    projects: [],
    templates: [],
    createdProject: null,
    calls: [],
  };

  const proposal = {
    id: 501,
    project_id: "smoke-project",
    title: "Ontwerpvoorstel - Smoke Suite",
    summary: "Smoke proposal summary",
    intro_text: "Een lichte, warme basis voor de smoke-test.",
    style_direction: "Editorial comfort met rustige materialen.",
    color_advice: "Zand, kalk en saliegroen.",
    closing_text: "Klaar voor akkoord en planning.",
    version: 1,
    status: "concept",
  };

  const detail = {
    id: "smoke-project",
    title: "Smoke Suite",
    client_name: "Familie Test",
    address: "Amsterdam",
    location: "Amsterdam",
    status: "proposal",
    vision: "Een lichte, warme basis voor de smoke-test.",
    summary: "Editorial comfort met rustige materialen.",
    lead: "Nova Studio",
    delivery: "Juni 2026",
    goals: ["Maak de proposal zichtbaar", "Open de presentatie"],
    principles: [{ k: "Sfeer", v: "Rustig en tactiel" }],
    palette: [{ name: "Salie", hex: "#8A9A7B" }],
    materials: [{ id: "mat-1", name: "Kalkverf", spec: "Mat", application: "Wanden" }],
    budget_lines: [],
  };

  const shopping = {
    total: 1250,
    items: [{
      id: "line-1",
      name: "Linnen fauteuil",
      brand: "Nova Select",
      price: 1250,
      quantity: 1,
      is_feature: 1,
      category: "Meubilair",
    }],
  };

  async function fetchStub(input, init = {}) {
    const path = typeof input === "string" ? input : input.url;
    const method = (init.method || "GET").toUpperCase();
    state.calls.push(`${method} ${path}`);

    if (method === "GET" && path === "/api/auth/status") return jsonResponse({ hasUsers: false, user: null });
    if (method === "GET" && path === "/api/projects?status=") return jsonResponse(state.projects);
    if (method === "GET" && path === "/api/projects?status=&templates=1") return jsonResponse(state.templates);
    if (method === "GET" && path === "/api/clients") return jsonResponse([]);
    if (method === "GET" && path === "/api/products") return jsonResponse([]);
    if (method === "GET" && path === "/api/notifications/count") return jsonResponse({ unread: 0 });

    if (method === "POST" && path === "/api/projects") {
      const body = JSON.parse(init.body || "{}");
      if (Number(body.is_template || 0) === 1) {
        const template = {
          ...detail,
          id: "template-project",
          title: body.title,
          client_name: "",
          address: body.address || "",
          is_template: 1,
          template_name: body.template_name || body.title,
        };
        state.templates = [template];
        return jsonResponse({ id: template.id });
      }
      state.createdProject = { ...detail, title: body.title, client_name: body.clientName || "Familie Test", address: body.address };
      state.projects = [state.createdProject];
      return jsonResponse({ id: state.createdProject.id });
    }

    if (method === "GET" && path === "/api/projects/template-project") return jsonResponse(state.templates[0]);
    if (method === "GET" && path === "/api/floorplans/project/template-project") return jsonResponse([]);
    if (method === "GET" && path === "/api/moodboards/project/template-project") return jsonResponse([]);
    if (method === "GET" && path === "/api/products/shopping-list/template-project") return jsonResponse({ total: 0, items: [] });
    if (method === "GET" && path === "/api/proposals/project/template-project") return jsonResponse([]);
    if (method === "GET" && path === "/api/projects/smoke-project") return jsonResponse(state.createdProject || detail);
    if (method === "GET" && path === "/api/floorplans/project/smoke-project") return jsonResponse([]);
    if (method === "GET" && path === "/api/moodboards/project/smoke-project") return jsonResponse([{ id: "board-1", assets: [] }]);
    if (method === "GET" && path === "/api/products/shopping-list/smoke-project") return jsonResponse(shopping);
    if (method === "GET" && path === "/api/proposals/project/smoke-project") return jsonResponse([proposal]);
    if (method === "GET" && path === "/api/proposals/501/exports") return jsonResponse([]);

    return new Response(`Unhandled smoke request: ${method} ${path}`, { status: 500 });
  }

  return { fetchStub, state };
}

test("project to proposal flow renders the proposal document and opens presentation", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/#/projects",
    pretendToBeVisual: true,
  });

  const previous = {
    window: global.window,
    document: global.document,
    navigator: global.navigator,
    localStorage: global.localStorage,
    CustomEvent: global.CustomEvent,
    Element: global.Element,
    fetch: global.fetch,
    IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT,
  };

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;
  global.CustomEvent = dom.window.CustomEvent;
  global.Element = dom.window.Element;
  window.scrollTo = () => {};
  window.print = () => {};
  window.open = () => {};

  const { fetchStub, state } = createApiStub();
  global.fetch = fetchStub;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require("react");
  const { createRoot } = require("react-dom/client");

  const vite = await (await import("vite")).createServer({
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
  });

  const { default: App } = await vite.ssrLoadModule("/web/src/App.jsx");
  const root = createRoot(document.getElementById("root"));
  t.after(async () => {
    await React.act(async () => root.unmount());
    await vite.close();
    dom.window.close();
    global.window = previous.window;
    global.document = previous.document;
    global.navigator = previous.navigator;
    global.localStorage = previous.localStorage;
    global.CustomEvent = previous.CustomEvent;
    global.Element = previous.Element;
    global.fetch = previous.fetch;
    global.IS_REACT_ACT_ENVIRONMENT = previous.IS_REACT_ACT_ENVIRONMENT;
  });

  await React.act(async () => root.render(React.createElement(App)));

  await waitFor(() => byText(document, "Nog geen projecten"), "empty projects state");

  await React.act(async () => click(byText(document, "Templates", "button")));
  await waitFor(() => byText(document, "Nog geen projecttemplates"), "empty templates state");
  await React.act(async () => click(byText(document, "Nieuw template", "button")));
  const templateInput = await waitFor(() => document.querySelector("input[placeholder='Stadsappartement basispakket']"), "new template title input");
  await React.act(async () => {
    setInputValue(templateInput, "Smoke Template");
    setInputValue(document.querySelector("input[placeholder='Basis intake + voorstelstructuur']"), "Basis smoke-template");
  });
  await React.act(async () => click(byText(document, "Template aanmaken", "button")));
  await waitFor(() => state.calls.includes("GET /api/projects/template-project"), `created template detail load; calls=${state.calls.join(" | ")}`);
  await waitFor(() => byText(document, "Smoke Template"), "opened template detail");
  await React.act(async () => click(byText(document, "Projecten", ".nav-item")));
  await waitFor(() => byText(document, "Nog geen projecten"), "returned to project list");

  await React.act(async () => click(byText(document, "Nieuw project", "button")));
  const titleInput = await waitFor(() => document.querySelector("input[placeholder='Herenhuis aan de Keizersgracht']"), "new project title input");
  await React.act(async () => {
    setInputValue(titleInput, "Smoke Suite");
    setInputValue(document.querySelector("input[placeholder='Familie Van der Velde']"), "Familie Test");
    setInputValue(document.querySelector("input[placeholder='Amsterdam — Grachtengordel']"), "Amsterdam");
  });
  await React.act(async () => click(byText(document, "Project aanmaken", "button")));

  await waitFor(() => state.calls.includes("GET /api/projects/smoke-project"), `created project detail load; calls=${state.calls.join(" | ")}`);
  await waitFor(() => byText(document, "Smoke Suite"), "opened project title");

  await React.act(async () => click(byText(document, "Projecten", ".nav-item")));
  await waitFor(() => byText(document, "Projectlevenscyclus"), "project status model panel");
  assert.ok(byText(document, "Klant heeft akkoord gegeven; planning en inkoop kunnen starten."), "status model explains approved state");

  await React.act(async () => click(byText(document, "Smoke Suite", "h3")));
  await waitFor(() => byText(document, "Presenteer voorstel", "button"), "reopened project detail");

  await React.act(async () => click(byText(document, "Voorstel", ".proj-tab")));
  await waitFor(() => byText(document, "Voorstel — bladerbaar document"), "proposal tab");
  assert.ok(byText(document, "Ontwerpvoorstel"), "proposal cover is visible");
  assert.ok(byText(document, "Een lichte, warme basis voor de smoke-test."), "proposal text is visible");

  await React.act(async () => click(byText(document, "Presenteer", "button")));
  await waitFor(() => document.querySelector(".pres-anim"), "presentation animation root");
  assert.ok(byText(document, "Sluit presentatie", "button"), "fullscreen presentation controls are visible");
  assert.ok(byText(document, "Smoke Suite"), "presentation renders the created project");
});
