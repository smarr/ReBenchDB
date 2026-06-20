type ProjectRole = 'view' | 'edit' | 'owner';

interface MyProject {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  role: ProjectRole;
}

interface Member {
  userId: number;
  username: string;
  email: string;
  role: ProjectRole;
}

const ROLES: ProjectRole[] = ['view', 'edit', 'owner'];

let myProjects: MyProject[] = [];
let selectedProjectId: number | null = null;

function $id(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function showAlert(id: string, message: string): void {
  const el = $id(id);
  el.textContent = message;
  el.classList.remove('d-none');
}

function hideAlert(id: string): void {
  $id(id).classList.add('d-none');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function fetchMyProjects(): Promise<void> {
  hideAlert('admin-projects-error');
  try {
    const res = await fetch('/admin/api/my-projects', {
      headers: { Accept: 'application/json' }
    });
    const data = await readJson(res);
    if (!res.ok) {
      showAlert(
        'admin-projects-error',
        data.error || `Server error (${res.status})`
      );
      return;
    }
    myProjects = data.projects || [];
    renderProjectsList();
  } catch {
    showAlert('admin-projects-error', 'Network error loading projects.');
  }
}

function renderProjectsList(): void {
  const ul = $id('admin-projects-list');
  const empty = $id('admin-no-projects');
  ul.innerHTML = '';
  if (myProjects.length === 0) {
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');
  for (const p of myProjects) {
    const li = document.createElement('li');
    li.className =
      'list-group-item d-flex justify-content-between align-items-center';
    if (p.id === selectedProjectId) {
      li.classList.add('active');
    }
    li.style.cursor = 'pointer';
    li.innerHTML = `
      <span>
        <strong>${escapeHtml(p.name)}</strong>
        <small class="text-muted ms-2">/${escapeHtml(p.slug)}</small>
      </span>
      <span class="badge bg-secondary">${escapeHtml(p.role)}</span>
    `;
    li.addEventListener('click', () => selectProject(p.id));
    ul.appendChild(li);
  }
}

async function selectProject(projectId: number): Promise<void> {
  selectedProjectId = projectId;
  selectedGroupId = null;
  renderGroupsList();
  $id('admin-group-card').style.display = 'none';
  renderProjectsList();

  const project = myProjects.find((p) => p.id === projectId);
  if (!project) return;

  const card = $id('admin-members-card');
  const placeholder = $id('admin-members-placeholder');
  const nameEl = $id('admin-members-project-name');
  const notOwnerAlert = $id('admin-members-not-owner');
  const addSection = $id('admin-add-member-section');
  const tbody = $id('admin-members-tbody');

  nameEl.textContent = project.name;
  card.style.display = 'block';
  placeholder.style.display = 'none';
  hideAlert('admin-members-error');

  if (project.role !== 'owner') {
    notOwnerAlert.classList.remove('d-none');
    addSection.style.display = 'none';
    tbody.innerHTML = '';
    return;
  }

  notOwnerAlert.classList.add('d-none');
  addSection.style.display = '';

  try {
    const res = await fetch(`/admin/api/projects/${projectId}/members`, {
      headers: { Accept: 'application/json' }
    });
    const data = await readJson(res);
    if (!res.ok) {
      showAlert(
        'admin-members-error',
        data.error || `Server error (${res.status})`
      );
      tbody.innerHTML = '';
      return;
    }
    renderMembersTable(projectId, data.members || []);
  } catch {
    showAlert('admin-members-error', 'Network error loading members.');
  }
}

function renderMembersTable(projectId: number, members: Member[]): void {
  const tbody = $id('admin-members-tbody');
  tbody.innerHTML = '';
  for (const m of members) {
    const tr = document.createElement('tr');
    const roleOptions = ROLES.map(
      (r) =>
        `<option value="${r}"${r === m.role ? ' selected' : ''}>${r}</option>`
    ).join('');
    tr.innerHTML = `
      <td>${escapeHtml(m.username)}</td>
      <td>${escapeHtml(m.email)}</td>
      <td>
        <select class="form-select form-select-sm member-role-select"
          data-user-id="${m.userId}">${roleOptions}</select>
      </td>
      <td class="text-end">
        <button type="button"
          class="btn btn-sm btn-outline-danger member-remove-btn"
          data-user-id="${m.userId}">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody
    .querySelectorAll<HTMLSelectElement>('.member-role-select')
    .forEach((select) => {
      const userId = Number(select.dataset.userId);
      const originalRole = select.value as ProjectRole;
      select.addEventListener('change', () =>
        changeMemberRole(projectId, userId, select, originalRole)
      );
    });
  tbody
    .querySelectorAll<HTMLButtonElement>('.member-remove-btn')
    .forEach((btn) => {
      const userId = Number(btn.dataset.userId);
      btn.addEventListener('click', () => removeMember(projectId, userId));
    });
}

async function changeMemberRole(
  projectId: number,
  userId: number,
  select: HTMLSelectElement,
  originalRole: ProjectRole
): Promise<void> {
  hideAlert('admin-members-error');
  const newRole = select.value as ProjectRole;
  try {
    const res = await fetch(
      `/admin/api/projects/${projectId}/members/${userId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ role: newRole })
      }
    );
    const data = await readJson(res);
    if (!res.ok) {
      showAlert(
        'admin-members-error',
        data.error || `Server error (${res.status})`
      );
      select.value = originalRole;
      return;
    }
    select.dataset.originalRole = newRole;
  } catch {
    showAlert('admin-members-error', 'Network error updating role.');
    select.value = originalRole;
  }
}

async function removeMember(projectId: number, userId: number): Promise<void> {
  hideAlert('admin-members-error');
  if (!confirm('Remove this member from the project?')) return;
  try {
    const res = await fetch(
      `/admin/api/projects/${projectId}/members/${userId}`,
      {
        method: 'DELETE',
        headers: { Accept: 'application/json' }
      }
    );
    const data = await readJson(res);
    if (!res.ok) {
      showAlert(
        'admin-members-error',
        data.error || `Server error (${res.status})`
      );
      return;
    }
    selectProject(projectId);
  } catch {
    showAlert('admin-members-error', 'Network error removing member.');
  }
}

function wireCreateProject(): void {
  const form = $id('create-project-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('create-project-error');
    const name = ($id('create-project-name') as HTMLInputElement).value.trim();
    const description = (
      $id('create-project-description') as HTMLTextAreaElement
    ).value.trim();
    if (!name) return;
    try {
      const res = await fetch('/admin/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ name, description })
      });
      const data = await readJson(res);
      if (!res.ok) {
        showAlert(
          'create-project-error',
          data.error || `Server error (${res.status})`
        );
        return;
      }
      form.reset();
      await fetchMyProjects();
      if (data.project?.id) {
        selectProject(data.project.id);
      }
    } catch {
      showAlert('create-project-error', 'Network error creating project.');
    }
  });
}

function wireAddMember(): void {
  const form = $id('add-member-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('admin-members-error');
    if (selectedProjectId === null) return;
    const username = (
      $id('add-member-username') as HTMLInputElement
    ).value.trim();
    const role = ($id('add-member-role') as HTMLSelectElement).value;
    if (!username) return;
    try {
      const res = await fetch(
        `/admin/api/projects/${selectedProjectId}/members`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({ username, role })
        }
      );
      const data = await readJson(res);
      if (!res.ok) {
        showAlert(
          'admin-members-error',
          data.error || `Server error (${res.status})`
        );
        return;
      }
      form.reset();
      selectProject(selectedProjectId);
    } catch {
      showAlert('admin-members-error', 'Network error adding member.');
    }
  });
}

async function fetchApiTokenStatus(): Promise<void> {
  try {
    const res = await fetch('/admin/api/token', {
      headers: { Accept: 'application/json' }
    });
    const data = await readJson(res);
    const statusEl = $id('api-token-status');
    if (!res.ok) {
      statusEl.textContent = 'Could not load token status.';
      return;
    }
    if (data.hasToken) {
      // eslint-disable-next-line max-len
      statusEl.innerHTML = `Token set &mdash; ends in <code>…${escapeHtml(data.suffix)}</code>`;
    } else {
      statusEl.textContent = 'No token set.';
    }
  } catch {
    $id('api-token-status').textContent = 'Network error loading token status.';
  }
}

function wireApiToken(): void {
  const btn = $id('api-token-generate-btn');
  btn.addEventListener('click', async () => {
    if (
      !confirm(
        // eslint-disable-next-line max-len
        'Generate a new API token? Any existing token will stop working immediately.'
      )
    )
      return;
    try {
      const res = await fetch('/admin/api/token/generate', {
        method: 'POST',
        headers: { Accept: 'application/json' }
      });
      const data = await readJson(res);
      if (!res.ok) {
        alert(data.error || `Server error (${res.status})`);
        return;
      }
      const reveal = $id('api-token-reveal');
      ($id('api-token-value') as HTMLElement).textContent = data.token;
      reveal.classList.remove('d-none');
      await fetchApiTokenStatus();
    } catch {
      alert('Network error generating token.');
    }
  });
}

// ── Group management ─────────────────────────────────────────────────────────

interface GroupInfo {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
}

interface GroupMember {
  userId: number;
  username: string;
  email: string;
}

let groups: GroupInfo[] = [];
let selectedGroupId: number | null = null;

async function fetchGroups(): Promise<void> {
  hideAlert('admin-groups-error');
  try {
    const res = await fetch('/admin/api/groups', {
      headers: { Accept: 'application/json' }
    });
    const data = await readJson(res);
    if (!res.ok) {
      showAlert(
        'admin-groups-error',
        data.error || `Server error (${res.status})`
      );
      return;
    }
    groups = data.groups || [];
    renderGroupsList();
    populateGroupSelect();
  } catch {
    showAlert('admin-groups-error', 'Network error loading groups.');
  }
}

function renderGroupsList(): void {
  const ul = $id('admin-groups-list');
  const empty = $id('admin-no-groups');
  ul.innerHTML = '';
  if (groups.length === 0) {
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');
  for (const g of groups) {
    const li = document.createElement('li');
    li.className =
      'list-group-item d-flex justify-content-between align-items-center';
    if (g.id === selectedGroupId) li.classList.add('active');
    li.style.cursor = 'pointer';
    li.innerHTML = `
      <strong>${escapeHtml(g.name)}</strong>
      <span class="badge bg-secondary">
        ${g.memberCount} member${g.memberCount === 1 ? '' : 's'}
      </span>
    `;
    li.addEventListener('click', () => selectGroup(g.id));
    ul.appendChild(li);
  }
}

function populateGroupSelect(): void {
  const select = document.getElementById(
    'add-group-to-project-select'
  ) as HTMLSelectElement | null;
  if (!select) return;
  const prev = select.value;
  select.innerHTML = groups
    .map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`)
    .join('');
  if (groups.some((g) => String(g.id) === prev)) select.value = prev;
}

function populateOwnerProjectSelect(): void {
  const select = document.getElementById(
    'assign-group-project'
  ) as HTMLSelectElement | null;
  if (!select) return;
  const ownerProjects = myProjects.filter((p) => p.role === 'owner');
  const prev = select.value;
  select.innerHTML = ownerProjects
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join('');
  if (ownerProjects.some((p) => String(p.id) === prev)) select.value = prev;
}

async function selectGroup(groupId: number): Promise<void> {
  selectedGroupId = groupId;
  selectedProjectId = null;
  renderGroupsList();
  renderProjectsList();

  const group = groups.find((g) => g.id === groupId);
  if (!group) return;

  $id('admin-group-name').textContent = group.name;
  $id('admin-group-card').style.display = 'block';
  $id('admin-members-card').style.display = 'none';
  $id('admin-members-placeholder').style.display = 'none';
  hideAlert('admin-group-error');
  $id('assign-group-result').classList.add('d-none');

  populateOwnerProjectSelect();

  try {
    const res = await fetch(`/admin/api/groups/${groupId}/members`, {
      headers: { Accept: 'application/json' }
    });
    const data = await readJson(res);
    if (!res.ok) {
      showAlert(
        'admin-group-error',
        data.error || `Server error (${res.status})`
      );
      $id('admin-group-members-tbody').innerHTML = '';
      return;
    }
    renderGroupMembersTable(groupId, data.members || []);
  } catch {
    showAlert('admin-group-error', 'Network error loading group members.');
  }
}

function renderGroupMembersTable(
  groupId: number,
  members: GroupMember[]
): void {
  const tbody = $id('admin-group-members-tbody');
  tbody.innerHTML = '';
  if (members.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="text-muted">No members yet.</td></tr>';
    return;
  }
  for (const m of members) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(m.username)}</td>
      <td>${escapeHtml(m.email)}</td>
      <td class="text-end">
        <button type="button"
          class="btn btn-sm btn-outline-danger group-member-remove-btn"
          data-user-id="${m.userId}">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
  tbody
    .querySelectorAll<HTMLButtonElement>('.group-member-remove-btn')
    .forEach((btn) => {
      const userId = Number(btn.dataset.userId);
      btn.addEventListener('click', () => removeGroupMember(groupId, userId));
    });
}

async function removeGroupMember(
  groupId: number,
  userId: number
): Promise<void> {
  hideAlert('admin-group-error');
  if (!confirm('Remove this member from the group?')) return;
  try {
    const res = await fetch(`/admin/api/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' }
    });
    const data = await readJson(res);
    if (!res.ok) {
      showAlert(
        'admin-group-error',
        data.error || `Server error (${res.status})`
      );
      return;
    }
    await fetchGroups();
    await selectGroup(groupId);
  } catch {
    showAlert('admin-group-error', 'Network error removing member.');
  }
}

async function deleteSelectedGroup(): Promise<void> {
  if (selectedGroupId === null) return;
  const group = groups.find((g) => g.id === selectedGroupId);
  if (
    !confirm(`Delete group "${group?.name ?? ''}"? This cannot be undone.`)
  )
    return;
  try {
    const res = await fetch(`/admin/api/groups/${selectedGroupId}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' }
    });
    const data = await readJson(res);
    if (!res.ok) {
      showAlert(
        'admin-group-error',
        data.error || `Server error (${res.status})`
      );
      return;
    }
    selectedGroupId = null;
    $id('admin-group-card').style.display = 'none';
    $id('admin-members-placeholder').style.display = '';
    await fetchGroups();
  } catch {
    showAlert('admin-group-error', 'Network error deleting group.');
  }
}

function wireCreateGroup(): void {
  const form = $id('create-group-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('create-group-error');
    const name = ($id('create-group-name') as HTMLInputElement).value.trim();
    const description = (
      $id('create-group-description') as HTMLTextAreaElement
    ).value.trim();
    if (!name) return;
    try {
      const res = await fetch('/admin/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ name, description: description || null })
      });
      const data = await readJson(res);
      if (!res.ok) {
        showAlert(
          'create-group-error',
          data.error || `Server error (${res.status})`
        );
        return;
      }
      form.reset();
      await fetchGroups();
      if (data.group?.id) selectGroup(data.group.id);
    } catch {
      showAlert('create-group-error', 'Network error creating group.');
    }
  });
}

function wireAddGroupMember(): void {
  const form = $id('add-group-member-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('admin-group-error');
    if (selectedGroupId === null) return;
    const username = (
      $id('add-group-member-username') as HTMLInputElement
    ).value.trim();
    if (!username) return;
    try {
      const res = await fetch(`/admin/api/groups/${selectedGroupId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ username })
      });
      const data = await readJson(res);
      if (!res.ok) {
        showAlert(
          'admin-group-error',
          data.error || `Server error (${res.status})`
        );
        return;
      }
      form.reset();
      await fetchGroups();
      await selectGroup(selectedGroupId);
    } catch {
      showAlert('admin-group-error', 'Network error adding member.');
    }
  });
}

function wireAssignGroupToProject(): void {
  const form = $id('assign-group-form') as HTMLFormElement;
  const resultEl = $id('assign-group-result');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('admin-group-error');
    resultEl.classList.add('d-none');
    if (selectedGroupId === null) return;
    const projectId = Number(
      ($id('assign-group-project') as HTMLSelectElement).value
    );
    const role = ($id('assign-group-role') as HTMLSelectElement).value;
    if (!projectId) {
      showAlert('admin-group-error', 'Please select a project.');
      return;
    }
    try {
      const res = await fetch(`/admin/api/projects/${projectId}/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ groupId: selectedGroupId, role })
      });
      const data = await readJson(res);
      if (!res.ok) {
        showAlert(
          'admin-group-error',
          data.error || `Server error (${res.status})`
        );
        return;
      }
      const added: number = data.added ?? 0;
      resultEl.textContent = `${added} member${added === 1 ? '' : 's'} added to project.`;
      resultEl.className = 'mt-2 alert alert-success';
    } catch {
      showAlert('admin-group-error', 'Network error assigning group.');
    }
  });
}

function wireAddGroupToProject(): void {
  const form = $id('add-group-to-project-form') as HTMLFormElement;
  const resultEl = $id('add-group-to-project-result');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('admin-members-error');
    resultEl.classList.add('d-none');
    if (selectedProjectId === null) return;
    const groupId = Number(
      ($id('add-group-to-project-select') as HTMLSelectElement).value
    );
    const role = ($id('add-group-to-project-role') as HTMLSelectElement).value;
    if (!groupId) {
      showAlert('admin-members-error', 'Please select a group.');
      return;
    }
    try {
      const res = await fetch(
        `/admin/api/projects/${selectedProjectId}/groups`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({ groupId, role })
        }
      );
      const data = await readJson(res);
      if (!res.ok) {
        showAlert(
          'admin-members-error',
          data.error || `Server error (${res.status})`
        );
        return;
      }
      const added: number = data.added ?? 0;
      resultEl.textContent = `${added} member${added === 1 ? '' : 's'} added to project.`;
      resultEl.className = 'mt-2 alert alert-success';
      if (added > 0) selectProject(selectedProjectId);
    } catch {
      showAlert('admin-members-error', 'Network error adding group to project.');
    }
  });
}

function wireDeleteGroup(): void {
  $id('admin-group-delete-btn').addEventListener('click', deleteSelectedGroup);
}

document.addEventListener('DOMContentLoaded', () => {
  wireCreateProject();
  wireAddMember();
  wireApiToken();
  wireCreateGroup();
  wireAddGroupMember();
  wireAssignGroupToProject();
  wireAddGroupToProject();
  wireDeleteGroup();
  fetchMyProjects();
  fetchApiTokenStatus();
  fetchGroups();
});
