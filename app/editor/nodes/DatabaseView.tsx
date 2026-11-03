import Database from "@shared/editor/nodes/Database";
import type { ComponentProps } from "@shared/editor/types";
import DatabaseBlock from "../components/Database";

/**
 * Client version of the database node: same schema and markdown as the
 * shared node, plus the React UI.
 */
export default class DatabaseView extends Database {
  component = (props: ComponentProps) => <DatabaseBlock {...props} />;
}
