import DatabaseViewNode from "@shared/editor/nodes/DatabaseViewNode";
import type { ComponentProps } from "@shared/editor/types";
import { LinkedDatabaseBlock } from "../components/Database";

/**
 * Client version of the linked database node: same schema and markdown as
 * the shared node, plus the React UI.
 */
export default class LinkedDatabaseView extends DatabaseViewNode {
  component = (props: ComponentProps) => <LinkedDatabaseBlock {...props} />;
}
