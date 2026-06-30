const WHEN_TO_USE = `Use this skill when you want to simplify code after making a change.`

const REVIEW_PROMPT = `Review the changed code, identify simple cleanup opportunities, and report them clearly.`

registerBundledSkill({
  name: 'simplify',
  description: 'Review changed code for reuse, quality, and efficiency, then fix any issues found.',
  whenToUse: WHEN_TO_USE,
  argumentHint: '<task>',
})
