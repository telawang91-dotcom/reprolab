import ast


RESERVED_NAMES = frozenset({"DATASET_PATHS", "SEED", "emit_artifact", "load_dataset"})
RESERVED_PREFIX = "_reprolab_"


class CodePolicyError(ValueError):
    """Raised when generated code tries to replace sandbox-managed capabilities."""


def _is_reserved(name: str) -> bool:
    return name in RESERVED_NAMES or name.startswith(RESERVED_PREFIX)


class _ReservedBindingVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.violations: set[str] = set()

    def _check(self, name: str | None) -> None:
        if name and _is_reserved(name):
            self.violations.add(name)

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, (ast.Store, ast.Del)):
            self._check(node.id)
        self.generic_visit(node)

    def visit_arg(self, node: ast.arg) -> None:
        self._check(node.arg)
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._check(node.name)
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._check(node.name)
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self._check(node.name)
        self.generic_visit(node)

    def visit_alias(self, node: ast.alias) -> None:
        self._check(node.asname or node.name.split(".", 1)[0])

    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
        self._check(node.name)
        self.generic_visit(node)


def validate_user_code(code: str) -> None:
    """Prevent generated code from shadowing system-managed sandbox symbols."""

    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        location = f"line {exc.lineno}" if exc.lineno else "unknown line"
        raise CodePolicyError(f"invalid Python syntax at {location}: {exc.msg}") from exc
    visitor = _ReservedBindingVisitor()
    visitor.visit(tree)
    if visitor.violations:
        names = ", ".join(sorted(visitor.violations))
        raise CodePolicyError(
            f"system-managed name cannot be assigned, deleted, or redefined: {names}"
        )
