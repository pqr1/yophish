document.addEventListener("DOMContentLoaded", () => {
  if (document.body.dataset.page !== "campaign") return;

  const form = document.getElementById("campaignForm");
  const statusEl = document.getElementById("campaignStatus");
  const templateCards = Array.from(document.querySelectorAll("[data-template]"));
  const subjectField = document.getElementById("campaignSubject");
  const bodyField = document.getElementById("campaignBody");

  const templateContent = {
  templateA: {
    subject: "Update to your account settings",
    body: `<p>Hello,</p>

<p>We are performing routine updates to improve account security and user experience.</p>

<p>If you recently requested a change to your account preferences, you can review the update at the link below:</p>

<p><a href="{{PHISHING_LINK}}">Review account update</a></p>

<p>If you did not request any changes, no action is required. This message is for notification purposes only.</p>

<p>Best regards,<br>
Account Support Team</p>`,
  },
  templateB: {
    subject: "Your account preferences have been updated",
    body: `<p>Hello,</p>

<p>This is a confirmation that your account preferences were successfully updated.</p>

<p>If you would like to review the changes, you can view your preferences here:</p>

<p><a href="{{PHISHING_LINK}}">View preferences</a></p>

<p>If this update was not made by you, please ignore this message; no action is required.</p>

<p>Regards,<br>
Support Team</p>`,
  },
};

  let activeTemplate = "templateA";
  applyTemplate();

  function applyTemplate() {
    const template = templateContent[activeTemplate];
    if (!template) return;
    subjectField.value = template.subject;
    bodyField.value = template.body;
  }

  templateCards.forEach((card) => {
    card.addEventListener("click", () => {
      templateCards.forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      activeTemplate = card.dataset.template;
      applyTemplate();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Sending campaign…";
    statusEl.style.color = "#2563eb";

    try {
      const name = form.campaignName.value.trim();
      const subject = form.campaignSubject.value.trim();
      const body = bodyField.value.trim();
      const recipients = parseRecipients(form.recipientList.value);

      if (!recipients.length) {
        throw new Error("Please add at least one recipient email address.");
      }

      const { campaignId } = await api.post("/campaigns", {
        name,
        subject,
        body,
        template: activeTemplate,
        recipients,
      });

      const result = await api.post("/campaigns/send", { campaignId });
      statusEl.textContent = `Done! ${result.sentCount} recipient(s) scheduled.`;
      statusEl.style.color = "#2563eb";
      form.reset();
      applyTemplate();
    } catch (error) {
      statusEl.style.color = "#ef4444";
      statusEl.textContent = error.message;
    }
  });
});

function parseRecipients(input) {
  return input
    .split(/[\n,]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}
