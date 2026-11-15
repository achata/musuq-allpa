document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("audio-status");
  document.querySelectorAll("[data-speak]").forEach(button => {
    button.addEventListener("click", () => {
      if (!("speechSynthesis" in window)) {
        status.textContent = "Este navegador no tiene lectura de voz disponible.";
        status.className = "notice notice-error";
        status.hidden = false;
        return;
      }

      const text = button.closest(".lesson-card").querySelector("p").textContent;
      window.speechSynthesis.cancel();
      const speech = new SpeechSynthesisUtterance(text);
      speech.lang = "es-PE";
      window.speechSynthesis.speak(speech);
      status.textContent = "Reproduciendo el consejo.";
      status.className = "notice";
      status.hidden = false;
    });
  });
});
