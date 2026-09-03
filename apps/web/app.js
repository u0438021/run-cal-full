const fileInput = document.querySelector("#fit-file");
const statusMessage = document.querySelector("#status-message");

function openFilePicker() {
  fileInput.click();
}

document.querySelector("#upload-button").addEventListener("click", openFilePicker);
document.querySelector("#mobile-upload").addEventListener("click", openFilePicker);

fileInput.addEventListener("change", () => {
  const count = fileInput.files.length;
  statusMessage.textContent = count
    ? `${count} FIT ${count === 1 ? "file" : "files"} selected. Upload connection will be added in the import workflow.`
    : "";
});

document.querySelectorAll(".segmented button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segmented button").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    statusMessage.textContent = `${button.dataset.period} chart period selected.`;
  });
});

document.querySelectorAll("[data-page]").forEach((link) => {
  link.addEventListener("click", () => {
    const page = link.dataset.page;
    document.querySelectorAll(`[data-page="${page}"]`).forEach((item) => item.classList.add("active"));
    document.querySelectorAll(`[data-page]:not([data-page="${page}"])`).forEach((item) => item.classList.remove("active"));
  });
});
