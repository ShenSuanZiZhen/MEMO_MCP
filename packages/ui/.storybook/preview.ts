import "../src/styles.css";

export const parameters = {
  a11y: {
    test: "error",
  },
  backgrounds: {
    default: "surface",
    values: [{ name: "surface", value: "#f4f6f8" }],
  },
};

export const decorators = [
  (story: () => string) =>
    `<div class="ui-showcase" style="max-width: 1280px; margin: 0 auto; padding: 24px;">${story()}</div>`,
];
