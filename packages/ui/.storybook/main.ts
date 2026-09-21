import type { StorybookConfig } from "@storybook/html-vite";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/html-vite",
    options: {},
  },
  stories: ["../src/**/*.stories.ts"],
  addons: ["@storybook/addon-a11y"],
  docs: {},
};

export default config;
