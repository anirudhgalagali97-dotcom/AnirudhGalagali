// Contact details used across the site. Edit these in one place.
// TODO: replace the email and LinkedIn placeholders with your real ones.
export const CONTACT = {
  email: "you@example.com",
  linkedin: "https://www.linkedin.com/in/your-profile",
  github: "https://github.com/anirudhgalagali97-dotcom",
};

type Node = { id: string; label: string; sub?: string; col: number; row: number; planned?: boolean; accent?: boolean };
type Edge = [string, string, { planned?: boolean }?];
export type Flow = { cols: number; rows: number; nodes: Node[]; edges: Edge[] };

// Architecture diagrams shown next to each case study.
export const FLOWS: Record<string, Flow> = {
  cattleco: {
    cols: 2,
    rows: 5,
    nodes: [
      { id: "wa", label: "WhatsApp message", sub: "Customer", col: 1, row: 1 },
      { id: "intent", label: "Intent classifier", sub: "n8n", col: 2, row: 1, accent: true },
      { id: "state", label: "Conversation state", sub: "n8n", col: 2, row: 2 },
      { id: "crm", label: "Customers and orders", sub: "Twenty CRM", col: 1, row: 3, accent: true },
      { id: "reply", label: "Formatted reply", sub: "WhatsApp", col: 2, row: 3 },
      { id: "pay", label: "Payment link", sub: "Razorpay", col: 1, row: 4, planned: true },
      { id: "hook", label: "Payment webhook", sub: "n8n", col: 2, row: 4, planned: true },
      { id: "receipt", label: "Receipt and order record", sub: "CRM", col: 2, row: 5, planned: true },
    ],
    edges: [["wa", "intent"], ["intent", "state"], ["state", "crm"], ["state", "reply"], ["crm", "pay", { planned: true }], ["pay", "hook", { planned: true }], ["hook", "receipt", { planned: true }]],
  },
  aios: {
    cols: 3,
    rows: 4,
    nodes: [
      { id: "user", label: "User request", col: 2, row: 1 },
      { id: "api", label: "FastAPI", sub: "API layer", col: 2, row: 2 },
      { id: "graph", label: "LangGraph agent", sub: "Orchestration", col: 2, row: 3, accent: true },
      { id: "tools", label: "Tools", sub: "Actions", col: 1, row: 4 },
      { id: "rag", label: "ChromaDB", sub: "Retrieval", col: 2, row: 4 },
      { id: "llm", label: "Ollama", sub: "Local LLM", col: 3, row: 4, accent: true },
    ],
    edges: [["user", "api"], ["api", "graph"], ["graph", "tools"], ["graph", "rag"], ["graph", "llm"]],
  },
  agentloop: {
    cols: 2,
    rows: 2,
    nodes: [
      { id: "ask", label: "Understand", sub: "Request", col: 1, row: 1 },
      { id: "find", label: "Retrieve", sub: "Your data", col: 2, row: 1, accent: true },
      { id: "act", label: "Act", sub: "Connected tools", col: 2, row: 2 },
      { id: "reply", label: "Reply", sub: "Back to the user", col: 1, row: 2, accent: true },
    ],
    edges: [["ask", "find"], ["find", "act"], ["act", "reply"]],
  },
  crm: {
    cols: 3,
    rows: 3,
    nodes: [
      { id: "cust", label: "Customer", col: 1, row: 1, accent: true },
      { id: "order", label: "Order", col: 2, row: 1 },
      { id: "product", label: "Product", col: 3, row: 1 },
      { id: "sub", label: "Subscription", col: 1, row: 2 },
      { id: "pay", label: "Payment", col: 2, row: 2 },
      { id: "variant", label: "Variant", sub: "Size", col: 3, row: 2 },
      { id: "delivery", label: "Delivery", col: 2, row: 3, accent: true },
    ],
    edges: [["cust", "order"], ["order", "product"], ["product", "variant"], ["cust", "sub"], ["order", "pay"], ["sub", "delivery"], ["order", "delivery"]],
  },
  preserva: {
    cols: 2,
    rows: 3,
    nodes: [
      { id: "scan", label: "Scan or add", sub: "Fridge photo", col: 1, row: 1, accent: true },
      { id: "inv", label: "Inventory", sub: "With expiry dates", col: 2, row: 1 },
      { id: "tips", label: "Storage guidance", col: 1, row: 2 },
      { id: "alert", label: "Use-soon reminders", col: 2, row: 2 },
      { id: "recipe", label: "Recipe suggestions", sub: "From what you have", col: 2, row: 3, accent: true },
    ],
    edges: [["scan", "inv"], ["inv", "tips"], ["inv", "alert"], ["alert", "recipe"]],
  },
  creative: {
    cols: 2,
    rows: 3,
    nodes: [
      { id: "mira", label: "Character", sub: "Mira", col: 1, row: 1, accent: true },
      { id: "scene", label: "Scene planning", col: 2, row: 1 },
      { id: "img", label: "Generative imagery", col: 1, row: 2 },
      { id: "remotion", label: "Remotion composition", col: 2, row: 2, accent: true },
      { id: "cut", label: "Ad cut", sub: "Voice and music", col: 2, row: 3 },
    ],
    edges: [["mira", "scene"], ["scene", "img"], ["img", "remotion"], ["remotion", "cut"]],
  },
};
