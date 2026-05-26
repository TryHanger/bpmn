from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional
import xml.etree.ElementTree as ET


BPMN_NS = {
    "bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL"
}


class NodeType(str, Enum):
    START_EVENT = "start_event"
    END_EVENT = "end_event"

    USER_TASK = "user_task"
    SERVICE_TASK = "service_task"

    EXCLUSIVE_GATEWAY = "exclusive_gateway"
    PARALLEL_GATEWAY = "parallel_gateway"
    INCLUSIVE_GATEWAY = "inclusive_gateway"

    CALL_ACTIVITY = "call_activity"

    UNKNOWN = "unknown"


@dataclass
class Node:
    id: str
    name: Optional[str]
    type: NodeType

    incoming: List[str] = field(default_factory=list)
    outgoing: List[str] = field(default_factory=list)

    incoming_flows: List[str] = field(default_factory=list)
    outgoing_flows: List[str] = field(default_factory=list)


@dataclass
class Edge:
    id: str
    source: str
    target: str


@dataclass
class BPMNGraph:
    process_id: str
    process_name: Optional[str]

    nodes: Dict[str, Node]
    edges: Dict[str, Edge]

    start_nodes: List[str]
    end_nodes: List[str]

    def get_node(self, node_id: str) -> Node:
        return self.nodes[node_id]

    def next_nodes(self, node_id: str) -> List[Node]:
        return [self.nodes[n] for n in self.nodes[node_id].outgoing]

    def prev_nodes(self, node_id: str) -> List[Node]:
        return [self.nodes[n] for n in self.nodes[node_id].incoming]


class BPMNGraphBuilder:

    NODE_MAPPING = {
        "startEvent": NodeType.START_EVENT,
        "endEvent": NodeType.END_EVENT,

        "userTask": NodeType.USER_TASK,
        "serviceTask": NodeType.SERVICE_TASK,

        "exclusiveGateway": NodeType.EXCLUSIVE_GATEWAY,
        "parallelGateway": NodeType.PARALLEL_GATEWAY,
        "inclusiveGateway": NodeType.INCLUSIVE_GATEWAY,

        "callActivity": NodeType.CALL_ACTIVITY,
    }

    def build_from_xml(self, xml_content: str) -> BPMNGraph:
        root = ET.fromstring(xml_content)

        process = root.find("bpmn:process", BPMN_NS)
        if process is None:
            raise ValueError("No <process> found in BPMN XML")

        process_id = process.attrib["id"]
        process_name = process.attrib.get("name")

        nodes: Dict[str, Node] = {}
        edges: Dict[str, Edge] = {}

        # ---------------------------------------------------------
        # 1. Parse nodes
        # ---------------------------------------------------------

        for element in process:
            tag = self._strip_namespace(element.tag)

            if tag in self.NODE_MAPPING:
                node_type = self.NODE_MAPPING[tag]

                node = Node(
                    id=element.attrib["id"],
                    name=element.attrib.get("name"),
                    type=node_type,
                )

                nodes[node.id] = node

        # ---------------------------------------------------------
        # 2. Parse sequence flows
        # ---------------------------------------------------------

        for element in process.findall("bpmn:sequenceFlow", BPMN_NS):
            flow_id = element.attrib["id"]
            source_ref = element.attrib["sourceRef"]
            target_ref = element.attrib["targetRef"]

            edge = Edge(
                id=flow_id,
                source=source_ref,
                target=target_ref,
            )

            edges[flow_id] = edge

            # attach graph links
            if source_ref in nodes:
                nodes[source_ref].outgoing.append(target_ref)
                nodes[source_ref].outgoing_flows.append(flow_id)

            if target_ref in nodes:
                nodes[target_ref].incoming.append(source_ref)
                nodes[target_ref].incoming_flows.append(flow_id)

        start_nodes = [
            node.id
            for node in nodes.values()
            if node.type == NodeType.START_EVENT
        ]

        end_nodes = [
            node.id
            for node in nodes.values()
            if node.type == NodeType.END_EVENT
        ]

        return BPMNGraph(
            process_id=process_id,
            process_name=process_name,
            nodes=nodes,
            edges=edges,
            start_nodes=start_nodes,
            end_nodes=end_nodes,
        )

    @staticmethod
    def _strip_namespace(tag: str) -> str:
        if "}" in tag:
            return tag.split("}", 1)[1]
        return tag


# =========================================================
# GRAPH HELPERS
# =========================================================

def find_parallel_splits(graph: BPMNGraph) -> List[Node]:
    return [
        node
        for node in graph.nodes.values()
        if (
            node.type == NodeType.PARALLEL_GATEWAY
            and len(node.outgoing) > 1
        )
    ]


def find_parallel_joins(graph: BPMNGraph) -> List[Node]:
    return [
        node
        for node in graph.nodes.values()
        if (
            node.type == NodeType.PARALLEL_GATEWAY
            and len(node.incoming) > 1
        )
    ]


def is_parallel_split(node: Node) -> bool:
    return (
        node.type == NodeType.PARALLEL_GATEWAY
        and len(node.outgoing) > 1
    )


def is_parallel_join(node: Node) -> bool:
    return (
        node.type == NodeType.PARALLEL_GATEWAY
        and len(node.incoming) > 1
    )


# =========================================================
# SAFE ROLLBACK ANALYSIS
# =========================================================

def find_safe_rollback_points(
    graph: BPMNGraph,
    current_node_id: str,
) -> List[str]:
    """
    Возвращает safe rollback points.

    Не возвращает parallel join gateway,
    так как rollback туда может deadlock'нуть процесс.
    """

    visited = set()
    result = []

    def dfs(node_id: str):
        if node_id in visited:
            return

        visited.add(node_id)

        node = graph.get_node(node_id)

        # skip unsafe joins
        if not is_parallel_join(node):
            result.append(node_id)

        for prev_id in node.incoming:
            dfs(prev_id)

    dfs(current_node_id)

    return result


# =========================================================
# EXAMPLE
# =========================================================

if __name__ == "__main__":

    with open("process.bpmn20.xml", "r", encoding="utf-8") as f:
        xml_data = f.read()

    builder = BPMNGraphBuilder()
    graph = builder.build_from_xml(xml_data)

    print()
    print("=" * 60)
    print("PROCESS")
    print("=" * 60)

    print("Process ID:", graph.process_id)
    print("Process Name:", graph.process_name)

    print()
    print("=" * 60)
    print("NODES")
    print("=" * 60)

    for node in graph.nodes.values():
        print(
            f"""
ID: {node.id}
NAME: {node.name}
TYPE: {node.type}
INCOMING: {node.incoming}
OUTGOING: {node.outgoing}
""".strip()
        )
        print("-" * 60)

    print()
    print("=" * 60)
    print("PARALLEL SPLITS")
    print("=" * 60)

    for node in find_parallel_splits(graph):
        print(node.id, node.name)

    print()
    print("=" * 60)
    print("PARALLEL JOINS")
    print("=" * 60)

    for node in find_parallel_joins(graph):
        print(node.id, node.name)

    print()
    print("=" * 60)
    print("SAFE ROLLBACK POINTS")
    print("=" * 60)

    safe_points = find_safe_rollback_points(
        graph,
        "Activity_1sen18e"
    )

    for p in safe_points:
        print(p)