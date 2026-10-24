document.addEventListener("DOMContentLoaded", async () => {
  if (document.body.dataset.page !== "staff") return;

  const tableBody = document.getElementById("staffTableBody");
  tableBody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;

  try {
    const data = await api.get("/staff");
    if (!data.staff.length) {
      tableBody.innerHTML =
        '<tr><td colspan="6" style="color:#64748b">No staff data yet. Send a campaign first.</td></tr>';
      return;
    }

    tableBody.innerHTML = data.staff
      .map(
        (item) => `
        <tr>
          <td>${item.email}<br /><small style="color:#64748b">${item.campaign_name ?? "-"}</small></td>
          <td>${item.opened ? "Yes" : "No"}</td>
          <td>${item.opened ? "No" : "Yes"}</td>
          <td>${item.clicked ? "Yes" : "No"}</td>
          <td>${item.clicked ? "No" : "Yes"}</td>
          <td>${item.risk_level}</td>
        </tr>
      `,
      )
      .join("");
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="6" style="color:#ef4444">${error.message}</td></tr>`;
  }
});
