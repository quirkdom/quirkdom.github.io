/* Sidenote numbering and mobile disclosure for public/tufte.css.

   The vendored stylesheet already carries every rule this drives:
   `.sidenote-number` increments `sidenote-counter`, `.sidenote-number:after`
   and `.sidenote:before` render the number, and under 760px the note is hidden
   until `.margin-toggle:checked` matches. That last selector is an adjacent
   sibling, so each note needs exactly this pair inserted before it:

       <label class="margin-toggle sidenote-number" ...>
       <input class="margin-toggle" type="checkbox" ...>
       <span class="sidenote">...</span>

   Label first, then input -- reversing them breaks the sibling match.

   Load with `defer`. Runs once at parse time, no dependencies. */

const notes = document.querySelectorAll(".sidenote, .marginnote");
const narrow = window.matchMedia("(max-width: 760px)");

// Marginnotes carry no counter, so they must not consume a footnote number.
let sidenotes = 0;
let marginnotes = 0;

for (const note of notes) {
    const numbered = note.classList.contains("sidenote");
    const ordinal = numbered ? ++sidenotes : ++marginnotes;
    const noteId = note.id || `${numbered ? "sn" : "mn"}-${ordinal}`;
    note.id = noteId;

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.className = "margin-toggle";
    toggle.id = `${noteId}-toggle`;

    const label = document.createElement("label");
    label.className = numbered
        ? "margin-toggle sidenote-number"
        : "margin-toggle";
    label.htmlFor = toggle.id;
    label.tabIndex = 0;
    label.setAttribute("role", "button");
    label.setAttribute(
        "aria-label",
        numbered ? `Footnote ${ordinal}` : "Margin note",
    );

    note.before(label, toggle);

    const sync = () =>
        label.setAttribute(
            "aria-expanded",
            String(getComputedStyle(note).display !== "none"),
        );
    sync();
    toggle.addEventListener("change", sync);
    narrow.addEventListener("change", sync);

    // A label is not keyboard-operable and the input is display:none, so the
    // disclosure needs its own key handling.
    label.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        label.click();
    });
}