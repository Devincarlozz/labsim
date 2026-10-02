import {
  BreadboardModel,
  CircuitComponent,
  Wire,
  ContactId,
  NodeId,
  ElectricalNode,
  LogicState,
  WireId,
} from './types';

// ─── Node Graph Derivation ──────────────────────────────────────────────────

/**
 * Build electrical nodes from breadboard internal connectivity + placed wires.
 * Uses union-find to merge contacts that are electrically connected.
 */
export function deriveElectricalNodes(
  breadboard: BreadboardModel,
  wires: Map<WireId, Wire>,
  components: Map<string, CircuitComponent>,
): Map<NodeId, ElectricalNode> {
  const parent = new Map<ContactId, ContactId>();
  const rank = new Map<ContactId, number>();

  // Initialize union-find
  for (const id of breadboard.contacts.keys()) {
    parent.set(id, id);
    rank.set(id, 0);
  }

  function find(x: ContactId): ContactId {
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // Path compression
    let curr = x;
    while (curr !== root) {
      const next = parent.get(curr)!;
      parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  function union(a: ContactId, b: ContactId): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const rankA = rank.get(ra) || 0;
    const rankB = rank.get(rb) || 0;
    if (rankA < rankB) {
      parent.set(ra, rb);
    } else if (rankA > rankB) {
      parent.set(rb, ra);
    } else {
      parent.set(rb, ra);
      rank.set(ra, rankA + 1);
    }
  }

  // 1. Merge contacts sharing the same breadboard node group
  //    (e.g., all contacts in the same terminal strip column-half)
  const groups = new Map<string, ContactId[]>();
  for (const contact of breadboard.contacts.values()) {
    const list = groups.get(contact.nodeGroup) || [];
    list.push(contact.id);
    groups.set(contact.nodeGroup, list);
  }
  for (const groupContacts of groups.values()) {
    for (let i = 1; i < groupContacts.length; i++) {
      union(groupContacts[0], groupContacts[i]);
    }
  }

  // 2. Merge contacts connected by wires
  for (const wire of wires.values()) {
    if (parent.has(wire.startContactId) && parent.has(wire.endContactId)) {
      union(wire.startContactId, wire.endContactId);
    }
  }

  // 3. Merge contacts connected through component pins
  //    (component pins that are placed on contacts effectively connect them
  //     through the component's internal wiring — but for ICs, pins are NOT
  //     internally connected; they only share a node if on the same breadboard group)
  // For resistors/capacitors, their two pins pass current but we model them as
  // separate nodes for now (no analog simulation). Components just occupy contacts.
  void components; // Explicitly unused for now

  // 4. Collect nodes
  const nodeMap = new Map<ContactId, Set<ContactId>>(); // root -> contacts
  for (const id of breadboard.contacts.keys()) {
    const root = find(id);
    if (!nodeMap.has(root)) {
      nodeMap.set(root, new Set());
    }
    nodeMap.get(root)!.add(id);
  }

  // 5. Build ElectricalNode objects
  const nodes = new Map<NodeId, ElectricalNode>();
  let nodeIndex = 0;
  for (const [, contactIds] of nodeMap) {
    if (contactIds.size <= 1) {
      // Skip isolated single contacts unless they have a component pin or are a DAQ pin
      const contactId = contactIds.values().next().value!;
      const contact = breadboard.contacts.get(contactId);
      if (contact && !contact.occupied && contact.row !== 'daq') continue;
    }
    const nodeId: NodeId = `net-${nodeIndex++}`;
    nodes.set(nodeId, {
      id: nodeId,
      contactIds,
      state: 'Z' as LogicState, // Default high-Z until simulation sets it
    });
  }

  return nodes;
}

// ─── Connectivity Queries ────────────────────────────────────────────────────

export function findNodeForContact(
  nodes: Map<NodeId, ElectricalNode>,
  contactId: ContactId,
): ElectricalNode | null {
  for (const node of nodes.values()) {
    if (node.contactIds.has(contactId)) {
      return node;
    }
  }
  return null;
}

export function areContactsConnected(
  nodes: Map<NodeId, ElectricalNode>,
  a: ContactId,
  b: ContactId,
): boolean {
  for (const node of nodes.values()) {
    if (node.contactIds.has(a) && node.contactIds.has(b)) {
      return true;
    }
  }
  return false;
}

export function getConnectedContacts(
  nodes: Map<NodeId, ElectricalNode>,
  contactId: ContactId,
): Set<ContactId> {
  for (const node of nodes.values()) {
    if (node.contactIds.has(contactId)) {
      return node.contactIds;
    }
  }
  return new Set([contactId]);
}
