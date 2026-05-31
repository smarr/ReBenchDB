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

  tbody.querySelectorAll<HTMLSelectElement>('.member-role-select').forEach(
    (select) => {
      const userId = Number(select.dataset.userId);
      const originalRole = select.value as ProjectRole;
      select.addEventListener('change', () =>
        changeMemberRole(projectId, userId, select, originalRole)
      );
    }
  );
  tbody.querySelectorAll<HTMLButtonElement>('.member-remove-btn').forEach(
    (btn) => {
      const userId = Number(btn.dataset.userId);
      btn.addEventListener('click', () => removeMember(projectId, userId));
    }
  );
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

async function removeMember(
  projectId: number,
  userId: number
): Promise<void> {
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
    const name = (
      $id('create-project-name') as HTMLInputElement
    ).value.trim();
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

document.addEventListener('DOMContentLoaded', () => {
  wireCreateProject();
  wireAddMember();
  wireApiToken();
  fetchMyProjects();
  fetchApiTokenStatus();
});
