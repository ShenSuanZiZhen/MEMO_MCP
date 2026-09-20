import { renderUiShowcase, uiStoryMatrix } from "./index.js";

export default {
  title: "WP-14B/Form Status Feedback",
  parameters: {
    workPackage: "WP-14B",
    accessibility: {
      disableRules: ["color-contrast"],
      reason: "jsdom-based axe tests cannot evaluate canvas-backed contrast.",
    },
  },
};

export const StatusTagAllStates = story("StatusTag/AllStates");
export const FormFieldErrorAndSecret = story("FormField/ErrorAndSecret");
export const EffectiveResultFullGroups = story("EffectiveResult/FullGroups");
export const IssuePanelBlockingAndWarning = story(
  "IssuePanel/BlockingAndWarning",
);
export const TaskProgressLongRunning = story("TaskProgress/LongRunning");
export const PageStateStateMatrix = story("PageState/StateMatrix");

export const Showcase = {
  name: "Showcase/Complete",
  render: () => renderUiShowcase().html,
};

function story(title: string) {
  const entry = uiStoryMatrix.find((candidate) => candidate.title === title);
  if (entry === undefined) {
    throw new Error(`missing UI story: ${title}`);
  }
  return {
    name: title,
    render: entry.render,
  };
}
