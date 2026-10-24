document.addEventListener('DOMContentLoaded', async () => {
  if (document.body.dataset.page !== 'result') return;

  const select = document.getElementById('campaignSelect');
  const tableBody = document.getElementById('resultTableBody');
  const statsEl = document.getElementById('resultStats');
  const titleEl = document.getElementById('resultTitle');

  const renderMessageRow = (message, color = '#64748b') => {
    tableBody.innerHTML = `<tr><td colspan="6" style="color:${color}">${message}</td></tr>`;
  };

  try {
    const { campaigns } = await api.get('/campaigns');
    if (!campaigns.length) {
      select.innerHTML = '<option value="">No campaigns yet</option>';
      renderMessageRow('Create a campaign to view results.');
      return;
    }

    select.innerHTML = campaigns
      .map((campaign, index) => {
        const selected = index === 0 ? 'selected' : '';
        return `<option value="${campaign.id}" ${selected}>${campaign.name}</option>`;
      })
      .join('');

    select.addEventListener('change', () => loadResults(select.value));
    await loadResults(select.value);
  } catch (error) {
    renderMessageRow(error.message || 'Unable to load campaigns.', '#ef4444');
  }

  async function loadResults(campaignId) {
    if (!campaignId) {
      renderMessageRow('Select a campaign to view results.');
      return;
    }

    renderMessageRow('Loading…', '#94a3b8');
    try {
      const { campaign, recipients } = await api.get(`/results/${campaignId}`);
      titleEl.textContent = campaign.name;

      const sent = recipients.filter((r) => r.sent).length;
      const opened = recipients.filter((r) => r.opened).length;
      const clicked = recipients.filter((r) => r.clicked).length;
      statsEl.textContent = `Sent: ${sent} · Opens: ${opened} · Clicks: ${clicked}`;

      if (!recipients.length) {
        renderMessageRow('No recipients found for this campaign.');
        return;
      }

      tableBody.innerHTML = recipients
        .map((recipient) => {
          const openedLabel = recipient.opened ? 'Yes' : 'No';
          const notOpenedLabel = recipient.opened ? 'No' : 'Yes';
          const clickedLabel = recipient.clicked ? 'Yes' : 'No';
          const notClickedLabel = recipient.clicked ? 'No' : 'Yes';
          return `
            <tr>
              <td>${recipient.email}</td>
              <td>${openedLabel}</td>
              <td>${notOpenedLabel}</td>
              <td>${clickedLabel}</td>
              <td>${notClickedLabel}</td>
              <td>${recipient.risk_level}</td>
            </tr>
          `;
        })
        .join('');
    } catch (error) {
      renderMessageRow(error.message || 'Unable to load campaign results.', '#ef4444');
    }
  }
});
