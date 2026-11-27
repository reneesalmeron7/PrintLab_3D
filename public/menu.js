(() => {
  const button = document.querySelector("#menuBtn");
  const menu = document.querySelector("#menu");
  const mobile = matchMedia("(max-width: 1100px)");

  function setOpen(open) {
    menu.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
  }

  button.addEventListener("click", () => setOpen(!menu.classList.contains("open")));

  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target) && !button.contains(event.target)) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("open")) {
      setOpen(false);
      button.focus();
    }
  });

  mobile.addEventListener("change", () => setOpen(false));
})();
