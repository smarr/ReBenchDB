import { escapeForHtml } from './utils.js';

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

function showAlert(id: string, message: string): void {
  const el = $(id);
  el.text(message);
  el.removeClass('d-none');
}

function hideAlert(id: string): void {
  $(id).addClass('d-none');
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
  const ul = $('#admin-projects-list');
  const empty = $('#admin-no-projects');
  ul.html('');
  if (myProjects.length === 0) {
    empty.removeClass('d-none');
    return;
  }
  empty.addClass('d-none');
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
        <strong>${escapeForHtml(p.name)}</strong>
        <small class="text-muted ms-2">/${escapeForHtml(p.slug)}</small>
      </span>
      <span class="badge bg-secondary">${escapeForHtml(p.role)}</span>
    `;
    li.addEventListener('click', () => selectProject(p.id));
    ul.append(li);
  }
}

async function selectProject(projectId: number): Promise<void> {
  selectedProjectId = projectId;
  selectedGroupId = null;
  renderGroupsList();
  $('#admin-group-card').hide();
  renderProjectsList();

  const project = myProjects.find((p) => p.id === projectId);
  if (!project) return;

  const card = $('#admin-members-card');
  const placeholder = $('#admin-members-placeholder');
  const nameEl = $('#admin-members-project-name');
  const notOwnerAlert = $('#admin-members-not-owner');
  const addSection = $('#admin-add-member-section');
  const tbody = $('#admin-members-tbody');

  nameEl.text(project.name);
  card.show();
  placeholder.hide();
  hideAlert('admin-members-error');

  if (project.role !== 'owner') {
    notOwnerAlert.removeClass('d-none');
    addSection.hide();
    tbody.html('');
    return;
  }

  notOwnerAlert.addClass('d-none');
  addSection.show();

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
      tbody.html('');
      return;
    }
    renderMembersTable(projectId, data.members || []);
  } catch {
    showAlert('admin-members-error', 'Network error loading members.');
  }
}

function renderMembersTable(projectId: number, members: Member[]): void {
  const tbody = $('#admin-members-tbody');
  tbody.html('');
  for (const m of members) {
    const tr = document.createElement('tr');
    const roleOptions = ROLES.map(
      (r) =>
        `<option value="${r}"${r === m.role ? ' selected' : ''}>${r}</option>`
    ).join('');
    tr.innerHTML = `
      <td>${escapeForHtml(m.username)}</td>
      <td>${escapeForHtml(m.email)}</td>
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
    tbody.append(tr);
  }

  tbody.find('.member-role-select').each((_, s) => {
    const select = s as HTMLSelectElement;
    const userId = Number(select.dataset.userId);
    const originalRole = select.value as ProjectRole;
    select.addEventListener('change', () =>
      changeMemberRole(projectId, userId, select, originalRole)
    );
  });
  tbody.find('.member-remove-btn').each((_, b) => {
    const btn = b as HTMLButtonElement;
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
  const form = $('#create-project-form');
  form.on('submit', async (e) => {
    e.preventDefault();
    hideAlert('create-project-error');
    const name = $('#create-project-name').val()?.trim();
    const description = $('#create-project-description').val()?.trim();
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
      form.trigger('reset');
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
  const form = $('#add-member-form');
  form.on('submit', async (e) => {
    e.preventDefault();
    hideAlert('admin-members-error');
    if (selectedProjectId === null) return;
    const username = $('#add-member-username').val()?.trim();
    const role = $('#add-member-role').val();
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
      form.trigger('reset');
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
    const statusEl = $('#api-token-status');
    if (!res.ok) {
      statusEl.text('Could not load token status.');
      return;
    }
    if (data.hasToken) {
      // eslint-disable-next-line max-len
      statusEl.html(
        `Token set &mdash; ends in <code>…${escapeForHtml(data.suffix)}</code>`
      );
    } else {
      statusEl.text('No token set.');
    }
  } catch {
    $('#api-token-status').text('Network error loading token status.');
  }
}

function wireApiToken(): void {
  const btn = $('#api-token-generate-btn');
  btn.on('click', async () => {
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
      const reveal = $('#api-token-reveal');
      $('#api-token-value').text(data.token);
      reveal.removeClass('d-none');
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
  const ul = $('#admin-groups-list');
  const empty = $('#admin-no-groups');
  ul.html('');
  if (groups.length === 0) {
    empty.removeClass('d-none');
    return;
  }
  empty.addClass('d-none');
  for (const g of groups) {
    const li = document.createElement('li');
    li.className =
      'list-group-item d-flex justify-content-between align-items-center';
    if (g.id === selectedGroupId) li.classList.add('active');
    li.style.cursor = 'pointer';
    li.innerHTML = `
      <strong>${escapeForHtml(g.name)}</strong>
      <span class="badge bg-secondary">
        ${g.memberCount} member${g.memberCount === 1 ? '' : 's'}
      </span>
    `;
    li.addEventListener('click', () => selectGroup(g.id));
    ul.append(li);
  }
}

function populateGroupSelect(): void {
  const select = document.getElementById(
    'add-group-to-project-select'
  ) as HTMLSelectElement | null;
  if (!select) return;
  const prev = select.value;
  select.innerHTML = groups
    .map((g) => `<option value="${g.id}">${escapeForHtml(g.name)}</option>`)
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
    .map((p) => `<option value="${p.id}">${escapeForHtml(p.name)}</option>`)
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

  $('#admin-group-name').text(group.name);
  $('#admin-group-card').show();
  $('#admin-members-card').hide();
  $('#admin-members-placeholder').hide();
  hideAlert('admin-group-error');
  $('#assign-group-result').addClass('d-none');

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
      $('#admin-group-members-tbody').html('');
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
  const tbody = $('#admin-group-members-tbody');
  tbody.html('');
  if (members.length === 0) {
    tbody.html(
      '<tr><td colspan="3" class="text-muted">No members yet.</td></tr>'
    );
    return;
  }
  for (const m of members) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeForHtml(m.username)}</td>
      <td>${escapeForHtml(m.email)}</td>
      <td class="text-end">
        <button type="button"
          class="btn btn-sm btn-outline-danger group-member-remove-btn"
          data-user-id="${m.userId}">Remove</button>
      </td>
    `;
    tbody.append(tr);
  }
  tbody.find('.group-member-remove-btn').each((idx, btn) => {
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
  if (!confirm(`Delete group "${group?.name ?? ''}"? This cannot be undone.`))
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
    $('#admin-group-card').addClass('d-none');
    $('#admin-members-placeholder').removeClass('d-none');
    await fetchGroups();
  } catch {
    showAlert('admin-group-error', 'Network error deleting group.');
  }
}

function wireCreateGroup(): void {
  const form = $('#create-group-form');
  form.on('submit', async (e) => {
    e.preventDefault();
    hideAlert('create-group-error');
    const name = $('#create-group-name').val()?.trim();
    const description = $('#create-group-description').val()?.trim();
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
      form.trigger('reset');
      await fetchGroups();
      if (data.group?.id) selectGroup(data.group.id);
    } catch {
      showAlert('create-group-error', 'Network error creating group.');
    }
  });
}

function wireAddGroupMember(): void {
  const form = $('#add-group-member-form');
  form.on('submit', async (e) => {
    e.preventDefault();
    hideAlert('admin-group-error');
    if (selectedGroupId === null) return;
    const username = $('#add-group-member-username').val()?.trim();
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
      form.trigger('reset');
      await fetchGroups();
      await selectGroup(selectedGroupId);
    } catch {
      showAlert('admin-group-error', 'Network error adding member.');
    }
  });
}

function wireAssignGroupToProject(): void {
  const form = $('#assign-group-form');
  const resultEl = $('#assign-group-result');
  form.on('submit', async (e) => {
    e.preventDefault();
    hideAlert('admin-group-error');
    resultEl.addClass('d-none');
    if (selectedGroupId === null) return;
    const projectId = Number($('#assign-group-project').val());
    const role = $('#assign-group-role').val();
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
      const members = 'member' + (added === 1 ? '' : 's');
      resultEl.text(`${added} ${members} added to project.`);
      resultEl.addClass('mt-2 alert alert-success');
    } catch {
      showAlert('admin-group-error', 'Network error assigning group.');
    }
  });
}

function wireAddGroupToProject(): void {
  const form = $('#add-group-to-project-form');
  const resultEl = $('#add-group-to-project-result');
  form.on('submit', async (e) => {
    e.preventDefault();
    hideAlert('admin-members-error');
    resultEl.addClass('d-none');
    if (selectedProjectId === null) return;
    const groupId = Number($('#add-group-to-project-select').val());
    const role = $('#add-group-to-project-role').val();
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
      const members = 'member' + (added === 1 ? '' : 's');
      resultEl.text(`${added} ${members} added to project.`);
      resultEl.addClass('mt-2 alert alert-success');
      if (added > 0) selectProject(selectedProjectId);
    } catch {
      showAlert(
        'admin-members-error',
        'Network error adding group to project.'
      );
    }
  });
}

function wireDeleteGroup(): void {
  $('#admin-group-delete-btn').on('click', deleteSelectedGroup);
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
