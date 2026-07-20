"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearOpsCredentials,
  loadOpsAuthHeader,
  opsApiUrl,
  saveOpsCredentials,
} from "@/lib/ops-auth";

/** Role shape returned by GET/PATCH/POST /api/internal/roles (toRoleDetail). */
type AdminRole = {
  id: string;
  title: string;
  location: string;
  type: string;
  summary: string;
  description: string;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
};

type RoleFields = {
  title: string;
  location: string;
  type: string;
  description: string;
};

const EMPTY_FIELDS: RoleFields = { title: "", location: "", type: "full-time", description: "" };

function fieldsOf(role: AdminRole): RoleFields {
  return {
    title: role.title,
    location: role.location,
    type: role.type,
    description: role.description,
  };
}

export function OpsJobsClient() {
  const [authHeader, setAuthHeader] = useState<string | null>(null);
  const [user, setUser] = useState("ops");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [createFields, setCreateFields] = useState<RoleFields>(EMPTY_FIELDS);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<RoleFields>(EMPTY_FIELDS);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setAuthHeader(loadOpsAuthHeader());
  }, []);

  const onUnauthorized = useCallback((message: string) => {
    clearOpsCredentials();
    setAuthHeader(null);
    setAuthError(message);
    setRoles([]);
  }, []);

  const loadRoles = useCallback(
    async (header: string) => {
      setLoading(true);
      setListError(null);
      try {
        const res = await fetch(opsApiUrl("/api/internal/roles"), {
          headers: { accept: "application/json", authorization: header },
          cache: "no-store",
        });
        if (res.status === 401) {
          onUnauthorized("Authentication required. Enter ops credentials.");
          return;
        }
        if (!res.ok) {
          setListError(`Could not load roles (HTTP ${res.status}).`);
          setRoles([]);
          return;
        }
        const body = (await res.json()) as AdminRole[];
        setRoles(Array.isArray(body) ? body : []);
      } catch {
        setListError("Could not load roles.");
        setRoles([]);
      } finally {
        setLoading(false);
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    if (!authHeader) return;
    void loadRoles(authHeader);
  }, [authHeader, loadRoles]);

  const onLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    saveOpsCredentials(user.trim() || "ops", password);
    setAuthHeader(loadOpsAuthHeader());
    setPassword("");
  };

  const onLogout = () => {
    clearOpsCredentials();
    setAuthHeader(null);
    setRoles([]);
    setEditingId(null);
    setNotice(null);
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeader) return;
    setCreating(true);
    setListError(null);
    setNotice(null);
    try {
      const res = await fetch(opsApiUrl("/api/internal/roles"), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: authHeader },
        cache: "no-store",
        body: JSON.stringify(createFields),
      });
      if (res.status === 401) return onUnauthorized("Session expired. Sign in again.");
      if (!res.ok) {
        setListError(`Create failed (HTTP ${res.status}).`);
        return;
      }
      const created = (await res.json()) as AdminRole;
      setCreateFields(EMPTY_FIELDS);
      setNotice(`Created role “${created.title}”.`);
      await loadRoles(authHeader);
    } catch {
      setListError("Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (role: AdminRole) => {
    setEditingId(role.id);
    setEditFields(fieldsOf(role));
    setNotice(null);
  };

  const onSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeader || !editingId) return;
    setBusyId(editingId);
    setListError(null);
    setNotice(null);
    try {
      const res = await fetch(opsApiUrl(`/api/internal/roles/${encodeURIComponent(editingId)}`), {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: authHeader },
        cache: "no-store",
        body: JSON.stringify(editFields),
      });
      if (res.status === 401) return onUnauthorized("Session expired. Sign in again.");
      if (!res.ok) {
        setListError(`Save failed (HTTP ${res.status}).`);
        return;
      }
      const updated = (await res.json()) as AdminRole;
      setEditingId(null);
      setNotice(`Saved role “${updated.title}”.`);
      await loadRoles(authHeader);
    } catch {
      setListError("Save failed.");
    } finally {
      setBusyId(null);
    }
  };

  const closeRole = async (role: AdminRole) => {
    if (!authHeader) return;
    setBusyId(role.id);
    setListError(null);
    setNotice(null);
    try {
      const res = await fetch(
        opsApiUrl(`/api/internal/roles/${encodeURIComponent(role.id)}/close`),
        {
          method: "POST",
          headers: { authorization: authHeader },
          cache: "no-store",
        },
      );
      if (res.status === 401) return onUnauthorized("Session expired. Sign in again.");
      if (!res.ok) {
        setListError(`Close failed (HTTP ${res.status}).`);
        return;
      }
      setNotice(`Closed role “${role.title}”. It is now hidden from the public list.`);
      await loadRoles(authHeader);
    } catch {
      setListError("Close failed.");
    } finally {
      setBusyId(null);
    }
  };

  const reopenRole = async (role: AdminRole) => {
    if (!authHeader) return;
    setBusyId(role.id);
    setListError(null);
    setNotice(null);
    try {
      // Reopen through the same update endpoint the data layer exposes
      // (status → open); no parallel route is invented.
      const res = await fetch(opsApiUrl(`/api/internal/roles/${encodeURIComponent(role.id)}`), {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: authHeader },
        cache: "no-store",
        body: JSON.stringify({ status: "open" }),
      });
      if (res.status === 401) return onUnauthorized("Session expired. Sign in again.");
      if (!res.ok) {
        setListError(`Reopen failed (HTTP ${res.status}).`);
        return;
      }
      setNotice(`Reopened role “${role.title}”. It is back on the public list.`);
      await loadRoles(authHeader);
    } catch {
      setListError("Reopen failed.");
    } finally {
      setBusyId(null);
    }
  };

  if (!authHeader) {
    return (
      <section className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-ink">Ops sign-in</h1>
        <p className="mt-2 text-sm text-muted">
          Job-role management. Credentials come from the ops environment (
          <code className="text-xs">OPS_BASIC_AUTH_*</code>).
        </p>
        <form onSubmit={onLogin} className="mt-6 space-y-4" data-testid="ops-jobs-login">
          <label className="block text-sm font-medium text-ink">
            Username
            <input
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            Password
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {authError ? <p className="text-sm text-red-700">{authError}</p> : null}
          <button type="submit" className="btn btn-primary w-full">
            Sign in
          </button>
        </form>
      </section>
    );
  }

  return (
    <div className="space-y-8" data-testid="ops-jobs-admin">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Internal ops</p>
          <h1 className="font-display text-3xl font-semibold text-ink">Job roles</h1>
          <p className="mt-1 text-sm text-muted">
            Create, edit, close, and reopen roles. Path: <code className="text-xs">/ops/jobs</code>
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onLogout}>
          Sign out
        </button>
      </header>

      {notice ? (
        <p className="rounded-xl border border-green-600/30 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      ) : null}
      {listError ? (
        <p className="rounded-xl border border-red-600/30 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listError}
        </p>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-ink">Create a role</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={onCreate}
          data-testid="role-create-form"
        >
          <label className="text-sm font-medium text-ink">
            Title
            <input
              name="title"
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              value={createFields.title}
              onChange={(e) => setCreateFields((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </label>
          <label className="text-sm font-medium text-ink">
            Location
            <input
              name="location"
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              value={createFields.location}
              onChange={(e) => setCreateFields((f) => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Remote (US)"
              required
            />
          </label>
          <label className="text-sm font-medium text-ink">
            Type
            <input
              name="type"
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              value={createFields.type}
              onChange={(e) => setCreateFields((f) => ({ ...f, type: e.target.value }))}
              placeholder="e.g. full-time"
              list="ops-jobs-type-suggestions"
              required
            />
            <datalist id="ops-jobs-type-suggestions">
              <option value="full-time" />
              <option value="part-time" />
              <option value="contract" />
              <option value="internship" />
            </datalist>
          </label>
          <label className="text-sm font-medium text-ink sm:col-span-2">
            Description
            <textarea
              name="description"
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              rows={4}
              value={createFields.description}
              onChange={(e) => setCreateFields((f) => ({ ...f, description: e.target.value }))}
              required
            />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Creating…" : "Create role"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">
            All roles{" "}
            <span className="text-sm font-normal text-muted">
              {loading ? "(loading…)" : `(${roles.length})`}
            </span>
          </h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => authHeader && loadRoles(authHeader)}
          >
            Refresh
          </button>
        </div>

        {roles.length === 0 && !loading ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            No roles yet.
          </p>
        ) : null}

        <ul className="space-y-4" data-testid="ops-roles-list">
          {roles.map((role) => {
            const isEditing = editingId === role.id;
            const isBusy = busyId === role.id;
            return (
              <li
                key={role.id}
                className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
                data-testid="role-row"
                data-role-id={role.id}
                data-role-status={role.status}
              >
                {isEditing ? (
                  <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSaveEdit}>
                    <label className="text-sm font-medium text-ink">
                      Title
                      <input
                        className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
                        value={editFields.title}
                        onChange={(e) => setEditFields((f) => ({ ...f, title: e.target.value }))}
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-ink">
                      Location
                      <input
                        className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
                        value={editFields.location}
                        onChange={(e) => setEditFields((f) => ({ ...f, location: e.target.value }))}
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-ink">
                      Type
                      <input
                        className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
                        value={editFields.type}
                        onChange={(e) => setEditFields((f) => ({ ...f, type: e.target.value }))}
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-ink sm:col-span-2">
                      Description
                      <textarea
                        className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
                        rows={4}
                        value={editFields.description}
                        onChange={(e) =>
                          setEditFields((f) => ({ ...f, description: e.target.value }))
                        }
                        required
                      />
                    </label>
                    <div className="flex gap-2 sm:col-span-2">
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isBusy}
                        data-testid="role-save"
                      >
                        {isBusy ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-lg font-semibold text-ink">
                          {role.title}
                        </h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            role.status === "open"
                              ? "bg-green-100 text-green-800"
                              : "bg-neutral-200 text-neutral-700"
                          }`}
                        >
                          {role.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {role.location} · {role.type}
                      </p>
                      <p className="mt-2 max-w-2xl text-sm text-ink-soft">{role.summary}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => startEdit(role)}
                        data-testid="role-edit"
                      >
                        Edit
                      </button>
                      {role.status === "open" ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void closeRole(role)}
                          disabled={isBusy}
                          data-testid="role-close"
                        >
                          {isBusy ? "…" : "Close"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => void reopenRole(role)}
                          disabled={isBusy}
                          data-testid="role-reopen"
                        >
                          {isBusy ? "…" : "Reopen"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
