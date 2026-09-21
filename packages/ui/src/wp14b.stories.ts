import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  attachUiBehaviors,
  renderEffectiveResultPanel,
  renderFormField,
  renderIssuePanel,
  renderPageState,
  renderStatusTag,
  renderTaskProgress,
  renderUiShowcase,
  uiStoryMatrix,
} from "./index.js";
import "./styles.css";

const meta = {
  title: "WP-14B/Form Status Feedback",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj;

function withBehaviors(html: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "ui-showcase";
  root.innerHTML = html;
  attachUiBehaviors(root);
  return root;
}

export const StatusTagAllStates: Story = {
  name: "StatusTag / all states",
  render: () => withBehaviors(story("StatusTag/AllStates")),
};

export const FormFieldMatrix: Story = {
  name: "FormField / all types",
  render: () =>
    withBehaviors(
      [
        story("FormField/Matrix"),
        renderFormField({
          id: "storybook-disabled",
          label: "禁用字段",
          disabled: true,
          helpText: "用于 disabled state。",
        }).html,
      ].join(""),
    ),
};

export const EffectiveResultMatrix: Story = {
  name: "EffectiveResult / empty full changed",
  render: () => withBehaviors(story("EffectiveResult/Matrix")),
};

export const IssuePanelMatrix: Story = {
  name: "IssuePanel / blocking warning info",
  render: () => withBehaviors(story("IssuePanel/Matrix")),
};

export const TaskProgressMatrix: Story = {
  name: "TaskProgress / 0 running failed complete",
  render: () => withBehaviors(story("TaskProgress/Matrix")),
};

export const PageStateMatrix: Story = {
  name: "PageState / all states",
  render: () => withBehaviors(story("PageState/StateMatrix")),
};

export const Showcase: Story = {
  name: "Showcase / complete",
  render: () => {
    const root = document.createElement("div");
    root.innerHTML = renderUiShowcase().html;
    attachUiBehaviors(root);
    return root;
  },
};

export const IndividualStates: Story = {
  name: "Individual components / smoke",
  render: () =>
    withBehaviors(
      [
        renderStatusTag({ kind: "processing", announce: true }).html,
        renderEffectiveResultPanel({ idPrefix: "sb-empty", groups: {} }).html,
        renderIssuePanel({
          idPrefix: "sb-empty-issues",
          issues: [],
          targetIds: [],
        }).html,
        renderTaskProgress({
          idPrefix: "sb-progress-zero",
          label: "建立索引",
          percent: 0,
          stages: [{ label: "上传", state: "current" }],
          detail: "等待开始",
        }).html,
        renderPageState({ kind: "permission" }).html,
      ].join(""),
    ),
};

function story(title: string): string {
  const entry = uiStoryMatrix.find((candidate) => candidate.title === title);
  if (entry === undefined) {
    throw new Error(`missing UI story: ${title}`);
  }
  return entry.render();
}
