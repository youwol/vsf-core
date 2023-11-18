import shutil
from pathlib import Path

from youwol.pipelines.pipeline_typescript_weback_npm import (
    Template,
    PackageType,
    Dependencies,
    RunTimeDeps,
    generate_template,
    Bundles,
    MainModule,
)
from youwol.utils import parse_json

folder_path = Path(__file__).parent

pkg_json = parse_json(folder_path / "package.json")

load_dependencies = {
    "rxjs": "^6.5.5",
    "@youwol/webpm-client": "^2.2.0",
    "@youwol/logging": "^0.1.1",
}

template = Template(
    path=folder_path,
    type=PackageType.Library,
    name=pkg_json["name"],
    version=pkg_json["version"],
    shortDescription=pkg_json["description"],
    author=pkg_json["author"],
    dependencies=Dependencies(
        runTime=RunTimeDeps(
            externals={
                **load_dependencies,
                # lazy loaded on demand (e.g. for default view of data)
                "@youwol/fv-tree": "^0.2.3",
                # `ts-essentials` is used to help the `Immutable` type definition
                # It is not in dev-dependencies as we want it to be installed from consuming projects
                "ts-essentials": "^9.3.1",
            },
            includedInBundle={},
        ),
        devTime={
            # `conditional-type-checks` is used to realize 'compile time' tests on type definitions
            "conditional-type-checks": "^1.0.4",
            # `@youwol/flux-view` is used for type declarations
            "@youwol/rx-vdom": "^1.0.1",
            # three is a dev dependencies for testing & needed to generate documentation.
            "three": "^0.152.0",
            "@types/three": "^0.152.0",
            "@youwol/http-primitives": "^0.1.2",
            # @youwol/logging needs it
            "@youwol/cdn-client": "^2.0.6",
        },
    ),
    userGuide=False,
    bundles=Bundles(
        mainModule=MainModule(
            entryFile="./index.ts", loadDependencies=list(load_dependencies.keys())
        )
    ),
    testConfig="https://github.com/youwol/integration-tests-conf",
)

generate_template(template)

shutil.copyfile(
    src=folder_path / ".template" / "src" / "auto-generated.ts",
    dst=folder_path / "src" / "auto-generated.ts",
)

for file in [
    "README.md",
    ".gitignore",
    ".npmignore",
    ".prettierignore",
    "LICENSE",
    "package.json",
    # "tsconfig.json", because of the rx-vdom-config.ts
    "webpack.config.ts",
]:
    shutil.copyfile(src=folder_path / ".template" / file, dst=folder_path / file)
