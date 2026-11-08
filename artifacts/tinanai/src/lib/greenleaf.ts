export type GreenLeafCommand = "on" | "off" | "status" | "help";

const commandPattern = /^\/greenleaf(?:\s+(on|off|status|help))?$/i;

export function parseGreenLeafCommand(input: string): GreenLeafCommand | null {
  const match = input.trim().match(commandPattern);
  return match ? ((match[1]?.toLowerCase() ?? "on") as GreenLeafCommand) : null;
}

export function greenLeafCommandReply(
  command: GreenLeafCommand,
  isEnabled: boolean,
): string {
  switch (command) {
    case "on":
      return "Green Leaf Mode is enabled for this conversation. I’ll explore alternatives, question assumptions, distinguish facts from speculation, and suggest ways to test ideas.";
    case "off":
      return "Green Leaf Mode is disabled for this conversation. TINANAI’s normal chat behavior is restored.";
    case "status":
      return isEnabled
        ? "Green Leaf Mode is active for this conversation. It encourages independent thinking, fair examination of alternatives, clear uncertainty labels, creative exploration, and practical validation."
        : "Green Leaf Mode is inactive for this conversation. Use /greenleaf to enable it.";
    case "help":
      return [
        "Green Leaf Mode encourages independent thinking, systems-level exploration, creative ideas, and practical validation. Speculative and symbolic ideas are labeled clearly, and safety rules remain in effect.",
        "",
        "- `/greenleaf` or `/greenleaf on` — enable for this conversation",
        "- `/greenleaf off` — disable for this conversation",
        "- `/greenleaf status` — show the current state",
        "- `/greenleaf help` — show this guide",
      ].join("\n");
  }
}
