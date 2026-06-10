const { db } = require("../db/database");
const auth = require("./auth");
const { record } = require("./audit");

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ADMIN_WRITE_ROLES = new Set(["owner", "admin"]);

const OPEN_PATHS = [
  /^\/health$/,
  /^\/auth\/status$/,
  /^\/auth\/register$/,
  /^\/auth\/login$/,
  /^\/auth\/logout$/,
  /^\/auth\/me$/,
  /^\/portal\/view\//
];

function apiPath(req) {
  return (req.path || "").replace(/\/+$/, "") || "/";
}

function isOpenPath(path) {
  return OPEN_PATHS.some((pattern) => pattern.test(path));
}

function deny(req, res, status, message, reason) {
  if (status === 403) {
    record("authorization", req.originalUrl || req.url || "", "forbidden", {
      method: req.method,
      reason
    }, req.user ? req.user.id : "");
  }
  return res.status(status).json({ error: message });
}

function sameStudio(project, user) {
  if (!project) return false;
  if (!project.studio_id || !user?.studio_id) return true;
  return project.studio_id === user.studio_id;
}

function canReadOwned(row, user) {
  if (auth.userCount() === 0) return true;
  if (!user || !row) return false;
  if (ADMIN_WRITE_ROLES.has(user.role)) return sameStudio(row, user);
  return Boolean(row.owner_id) && row.owner_id === user.id && sameStudio(row, user);
}

function canReadProject(project, user) {
  return canReadOwned(project, user);
}

function canWriteProject(project, user) {
  if (auth.userCount() === 0) return true;
  if (!user || !project) return false;
  return ADMIN_WRITE_ROLES.has(user.role) && sameStudio(project, user);
}

function projectScopeClause(user, alias = "p") {
  if (auth.userCount() === 0 || !user) return { sql: "1 = 1", params: {} };
  const prefix = alias ? `${alias}.` : "";
  if (ADMIN_WRITE_ROLES.has(user.role)) {
    return {
      sql: `(${prefix}studio_id IS NULL OR ${prefix}studio_id = @authStudioId)`,
      params: { authStudioId: user.studio_id || "studio_default" }
    };
  }
  return {
    sql: `${prefix}owner_id = @authUserId AND (${prefix}studio_id IS NULL OR ${prefix}studio_id = @authStudioId)`,
    params: { authUserId: user.id, authStudioId: user.studio_id || "studio_default" }
  };
}

function visibleProjectWhere(req, alias = "p") {
  return projectScopeClause(req.user, alias);
}

function visibleOwnedWhere(req, alias = "") {
  return projectScopeClause(req.user, alias);
}

function stampOwnership(values, user) {
  if (auth.userCount() === 0 || !user) return values;
  return {
    ...values,
    studio_id: user.studio_id || "studio_default",
    owner_id: user.id
  };
}

function projectById(projectId) {
  if (!projectId) return null;
  return db.prepare("SELECT id, studio_id, owner_id FROM projects WHERE id = ?").get(projectId) || null;
}

function clientById(clientId) {
  if (!clientId) return null;
  return db.prepare("SELECT id, studio_id, owner_id FROM clients WHERE id = ?").get(clientId) || null;
}

function clientIdFromPath(path) {
  const p = path.split("/").filter(Boolean);
  if (p[0] !== "clients") return null;
  if (p[1] && !["contacts", "addresses"].includes(p[1])) return p[1];
  if (p[1] === "contacts" && p[2]) {
    return db.prepare("SELECT client_id FROM client_contacts WHERE id = ?").get(p[2])?.client_id || null;
  }
  if (p[1] === "addresses" && p[2]) {
    return db.prepare("SELECT client_id FROM client_addresses WHERE id = ?").get(p[2])?.client_id || null;
  }
  return null;
}

function projectIdFor(path) {
  const p = path.split("/").filter(Boolean);
  if (p[0] === "projects" && p[1] && p[1] !== "seed-sample") return p[1];
  if (p[0] === "intake" && p[1]) return p[1];
  if (["rooms", "floorplans", "moodboards", "materials", "proposals", "render"].includes(p[0]) && p[1] === "project" && p[2]) return p[2];
  if (p[0] === "products" && p[1] === "shopping-list" && p[2]) return p[2];
  if (p[0] === "budget" && ["scenarios", "rooms", "overview"].includes(p[1]) && p[2] === "project" && p[3]) return p[3];
  if (p[0] === "planning" && ["tasks", "milestones", "documents", "timeline"].includes(p[1]) && p[2] === "project" && p[3]) return p[3];
  return null;
}

function projectIdFromResource(path) {
  const p = path.split("/").filter(Boolean);
  if (p[0] === "projects" && p[1] && p[1] !== "seed-sample") return p[1];
  if (p[0] === "intake" && p[1]) return p[1];
  if (p[0] === "rooms" && p[1] && p[1] !== "reorder") {
    return db.prepare("SELECT project_id FROM rooms WHERE id = ?").get(p[1])?.project_id || null;
  }
  if (p[0] === "floorplans") {
    if (p[1] === "objects" && p[2]) {
      return db.prepare(`
        SELECT f.project_id FROM floorplan_objects o
        JOIN floorplans f ON f.id = o.floorplan_id
        WHERE o.id = ?
      `).get(p[2])?.project_id || null;
    }
    if (p[1]) return db.prepare("SELECT project_id FROM floorplans WHERE id = ?").get(p[1])?.project_id || null;
  }
  if (p[0] === "moodboards") {
    if (p[1] === "assets" && p[2]) {
      return db.prepare(`
        SELECT m.project_id FROM moodboard_assets a
        JOIN moodboards m ON m.id = a.moodboard_id
        WHERE a.id = ?
      `).get(p[2])?.project_id || null;
    }
    if (p[1]) return db.prepare("SELECT project_id FROM moodboards WHERE id = ?").get(p[1])?.project_id || null;
  }
  if (p[0] === "materials" && p[1] && !["project", "from-library", "reorder"].includes(p[1])) {
    return db.prepare("SELECT project_id FROM materials WHERE id = ?").get(p[1])?.project_id || null;
  }
  if (p[0] === "proposals") {
    if (p[1] === "sections" && p[2]) {
      return db.prepare(`
        SELECT pr.project_id FROM proposal_sections s
        JOIN proposals pr ON pr.id = s.proposal_id
        WHERE s.id = ?
      `).get(p[2])?.project_id || null;
    }
    if (p[1] === "comments" && p[2]) {
      return db.prepare(`
        SELECT pr.project_id FROM proposal_comments c
        JOIN proposals pr ON pr.id = c.proposal_id
        WHERE c.id = ?
      `).get(p[2])?.project_id || null;
    }
    if (p[1]) return db.prepare("SELECT project_id FROM proposals WHERE id = ?").get(p[1])?.project_id || null;
  }
  if (p[0] === "products" && p[1] === "selection" && p[2]) {
    return db.prepare("SELECT project_id FROM project_products WHERE id = ?").get(p[2])?.project_id || null;
  }
  if (p[0] === "budget") {
    if (p[1] === "scenarios" && p[2]) return db.prepare("SELECT project_id FROM budget_scenarios WHERE id = ?").get(p[2])?.project_id || null;
    if (p[1] === "room" && p[2]) {
      return db.prepare("SELECT project_id FROM rooms WHERE id = ?").get(p[2])?.project_id || null;
    }
  }
  if (p[0] === "planning") {
    if (p[1] === "tasks" && p[2]) return db.prepare("SELECT project_id FROM project_tasks WHERE id = ?").get(p[2])?.project_id || null;
    if (p[1] === "milestones" && p[2]) return db.prepare("SELECT project_id FROM project_milestones WHERE id = ?").get(p[2])?.project_id || null;
    if (p[1] === "documents" && p[2]) return db.prepare("SELECT project_id FROM project_documents WHERE id = ?").get(p[2])?.project_id || null;
  }
  if (p[0] === "render" && p[1]) return db.prepare("SELECT project_id FROM render_jobs WHERE id = ?").get(p[1])?.project_id || null;
  if (p[0] === "portal" && p[1] === "access" && p[2]) {
    return db.prepare("SELECT project_id FROM portal_access WHERE token = ?").get(p[2])?.project_id || null;
  }
  return null;
}

function projectIdFromBody(req) {
  const body = req.body || {};
  if (body.project_id) return body.project_id;
  if (body.projectId) return body.projectId;
  if (body.room_id) return db.prepare("SELECT project_id FROM rooms WHERE id = ?").get(body.room_id)?.project_id || null;
  if (body.floorplan_id) return db.prepare("SELECT project_id FROM floorplans WHERE id = ?").get(body.floorplan_id)?.project_id || null;
  if (body.moodboard_id) return db.prepare("SELECT project_id FROM moodboards WHERE id = ?").get(body.moodboard_id)?.project_id || null;
  if (body.proposal_id) return db.prepare("SELECT project_id FROM proposals WHERE id = ?").get(body.proposal_id)?.project_id || null;
  return null;
}

function projectForRequest(req) {
  const path = apiPath(req);
  const projectId = projectIdFromResource(path) || projectIdFor(path) || projectIdFromBody(req);
  return projectById(projectId);
}

function routeGate(req, res, next) {
  if (auth.userCount() === 0) return next();
  const path = apiPath(req);
  if (isOpenPath(path)) return next();
  if (!req.user) return deny(req, res, 401, "Authenticatie vereist", "missing_user");

  const project = projectForRequest(req);
  if (project && !canReadProject(project, req.user)) {
    return deny(req, res, 403, "Geen toegang tot dit project", "project_ownership");
  }

  const client = clientById(clientIdFromPath(path) || req.body?.client_id);
  if (client && !canReadOwned(client, req.user)) {
    return deny(req, res, 403, "Geen toegang tot deze klant", "client_ownership");
  }

  if (WRITE_METHODS.has(req.method)) {
    if (!ADMIN_WRITE_ROLES.has(req.user.role)) {
      return deny(req, res, 403, "Onvoldoende rechten", "write_role");
    }
    if (project && !canWriteProject(project, req.user)) {
      return deny(req, res, 403, "Geen schrijfrechten voor dit project", "project_write_scope");
    }
  }
  return next();
}

module.exports = {
  routeGate,
  visibleProjectWhere,
  visibleOwnedWhere,
  stampOwnership,
  canReadProject,
  canWriteProject,
  projectById
};
