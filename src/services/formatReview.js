function humanize(sectionName) {
  return sectionName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// draftOutput shape: { call_type, sections: [{ name, content }], main_takeaways: [...] }
// Output: a single formatted text block, matching the voice/structure this
// coach already posts manually - this is what goes into the existing
// service's `notes` field, which it splits into Discord embed chunks itself.
function formatReviewAsNotes(finalOutput) {
  const parts = [];

  for (const section of finalOutput.sections || []) {
    if (!section.points || section.points.length === 0) continue; // skip empty sections entirely

    const bullets = section.points.map((p) => `• ${p}`).join("\n");
    parts.push(`**${humanize(section.name)}**\n${bullets}`);
  }

  if (finalOutput.main_takeaways?.length) {
    const bullets = finalOutput.main_takeaways.map((t) => `• ${t}`).join("\n");
    parts.push(`**Main Takeaways**\n${bullets}`);
  }

  return parts.join("\n\n");
}

module.exports = { formatReviewAsNotes };
