export function initializeFilters(benchmarkNameSelector: string): void {
  const allGroups = $('.exe-suite-group');
  const byName = new Map();
  const groups: string[][] = [];

  allGroups.each((_, group) => {
    const namesInGroup: string[] = [];
    groups.push(namesInGroup);

    $(group)
      .find(benchmarkNameSelector)
      .each((_, element) => {
        const name = <string>element.textContent?.trim();
        if (!byName.has(name)) {
          byName.set(name, []);
          namesInGroup.push(name);
        }

        byName.get(name).push(element);
      });

    // make sure we don't have empty groups
    if (namesInGroup.length == 0) {
      groups.pop();
    }
  });

  let nameCheckBoxes = '';

  for (const group of groups) {
    nameCheckBoxes += '<div class="card card-body text-white bg-secondary">';
    nameCheckBoxes += '<div class="card-text">';

    for (const name of group) {
      nameCheckBoxes += `
        <div class="form-check">
        <input type="checkbox"
          class="form-check-input" id="filter-${name}" value="${name}" checked>
        <label class="form-check-label" for="filter-${name}">${name}</label>
        </div>`;
    }

    nameCheckBoxes += '</div></div>';
  }

  $('#filter-groups').html(nameCheckBoxes);
  $('#filter-groups .card-body input').on('change', (e) => {
    const checkBoxJQ = $(e.currentTarget);
    const name = checkBoxJQ.val();
    const nameElements = byName.get(name);
    if (checkBoxJQ.is(':checked')) {
      for (const nameElem of nameElements) {
        const nameElemJQ = $(nameElem);
        nameElemJQ.parent().show();
        nameElemJQ.closest('.exe-suite-group').show();
      }
    } else {
      for (const nameElem of nameElements) {
        const nameElemJQ = $(nameElem);
        nameElemJQ.parent().hide();
        if (nameElemJQ.closest('tbody').find('tr:visible').length == 0) {
          nameElemJQ.closest('.exe-suite-group').hide();
        }
      }
    }
  });

  $('#filter-all').on('click', () =>
    $('#filter-groups input').prop('checked', true).trigger('change')
  );
  $('#filter-none').on('click', () =>
    $('#filter-groups input').prop('checked', false).trigger('change')
  );
}
