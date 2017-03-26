import * as chai from "chai";
import * as fs from "fs";
import * as mocha from "mocha";
import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";
import * as ts from "typescript";
import { Delinter } from "../delint";
import * as Formatter from "../formatter/index";
import * as tsUml from "../typescript-uml";
import * as Uml from "../uml";

const expect = chai.expect;
chai.use(sinonChai);

describe("TypeScriptUml", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });
    afterEach(() => {
        sandbox.restore();
    });

    describe(".parseProject", () => {
        let root: string;
        let options: tsUml.IParseOptions;
        let returnValue: Uml.CodeModel;
        let findConfigFileStub: sinon.SinonStub;
        let readConfigFileStub: sinon.SinonStub;
        let formatDiagnosticsStub: sinon.SinonStub;
        let parseJsonConfigFileContentStub: sinon.SinonStub;
        let readFileSyncStub: sinon.SinonStub;
        let parseStub: sinon.SinonStub;
        let createSourceFileStub: sinon.SinonStub;

        const executeCut = () => {
            returnValue = tsUml.TypeScriptUml.parseProject(root, options);
        };

        beforeEach(() => {
            root = ".";
            options = {};

            findConfigFileStub = sandbox.stub(ts, "findConfigFile");
            findConfigFileStub.returns("tsconfig.json");
            readConfigFileStub = sandbox.stub(ts, "readConfigFile");
            readConfigFileStub.returns({
                config: {},
                error: undefined,
            });
            formatDiagnosticsStub = sandbox.stub(ts, "formatDiagnostics");
            formatDiagnosticsStub.returns("");
            parseJsonConfigFileContentStub = sandbox.stub(ts, "parseJsonConfigFileContent");
            parseJsonConfigFileContentStub.returns({
                errors: [],
                fileNames: [],
            });
            readFileSyncStub = sandbox.stub(fs, "readFileSync");
            readFileSyncStub.returns("{}");
            parseStub = sandbox.stub(Delinter.prototype, "parse");
            createSourceFileStub = sandbox.stub(ts, "createSourceFile", (filename: string) => {
                return filename;
            });
        });

        it("should return instance of uml.CodeModel", () => {
            executeCut();
            expect(returnValue).to.be.instanceOf(Uml.CodeModel);
        });

        it("should find config file if tsConfigPath is undefined", () => {
            root = "/home/user/project";
            findConfigFileStub.withArgs(root).returns("test/path/tsconfig.json");
            executeCut();
            expect(readConfigFileStub).to.have.been.calledWith("test/path/tsconfig.json");
        });

        it("should use tsConfigPath if defined", () => {
            root = "/home/user/project";
            options.tsconfig = "my/custom/tsconfig.json";
            executeCut();
            expect(readConfigFileStub).to.have.been.calledWith("my/custom/tsconfig.json");
        });

        it("should throw an Error containing the formatted diagnostics if readConfigFile fails", () => {
            readConfigFileStub.returns({
                error: "failed to read",
            });
            formatDiagnosticsStub.withArgs(["failed to read"]).returns("formatted diagnostic test");
            expect(executeCut).to.throw(/formatted diagnostic test/);
        });

        it("should parse the files from the parsed config", () => {
            const testObject = { testObject: true };
            readConfigFileStub.returns({
                config: testObject,
            });
            parseJsonConfigFileContentStub.withArgs(testObject, ts.sys, root).returns({
                errors: [],
                fileNames: ["a.ts", "b.ts"],
                options: {},
            });

            executeCut();

            expect(createSourceFileStub).to.have.been.calledWith("a.ts");
            expect(createSourceFileStub).to.have.been.calledWith("b.ts");
            expect(parseStub).to.have.been.calledWith("a.ts");
            expect(parseStub).to.have.been.calledWith("b.ts");
        });

        it("should parse using the target from the parsed config", () => {
            parseJsonConfigFileContentStub.withArgs(sinon.match.any, ts.sys, root).returns({
                errors: [],
                fileNames: ["a.ts", "b.ts"],
                options: {
                    target: ts.ScriptTarget.ES5,
                },
            });

            executeCut();

            expect(createSourceFileStub).to.have.been.always.calledWith(
                sinon.match.any, sinon.match.any, ts.ScriptTarget.ES5);
        });

        it("should throw an Error containing the formatted diagnostics if parseJsonConfigFileContent fails", () => {
            parseJsonConfigFileContentStub.returns({
                errors: ["error 1", "error 2"],
            });
            formatDiagnosticsStub.withArgs(["error 1", "error 2"]).returns("formatted diagnostic test");
            expect(executeCut).to.throw(/formatted diagnostic test/);
        });
    });

    describe(".parseFile", () => {
        let fileName: string;
        let target: ts.ScriptTarget;
        let delinter: Delinter;
        let returnValue: Uml.CodeModel;
        let parseStub: sinon.SinonStub;
        let createSourceFileSpy: sinon.SinonSpy;

        beforeEach(() => {
            parseStub = sandbox.stub(Delinter.prototype, "parse");
            createSourceFileSpy = sandbox.spy(ts, "createSourceFile");
            fileName = "";
            target = ts.ScriptTarget.ES5;
            delinter = undefined;
        });

        const executeCut = () => {
            returnValue = tsUml.TypeScriptUml.parseFile(fileName, target, delinter);
        };

        it("should parse source file using delinter", () => {
            fileName = "testInput/delint/class.test.ts";
            executeCut();
            expect(parseStub).to.have.been.calledWith(
                sinon.match({
                    fileName: "testInput/delint/class.test.ts",
                    languageVersion: target,
                    text: "class Foo {\n    // Test class\n}\n",
                }));
        });

        it("should return instance of uml.CodeModel", () => {
            fileName = "testInput/delint/class.test.ts";
            executeCut();
            expect(returnValue).to.be.instanceOf(Uml.CodeModel);
        });
    });

    describe(".generateClassDiagram", () => {
        let codeModel: Uml.CodeModel;
        let options: tsUml.IClassDiagramOptions;

        const executeCut = () => {
            return tsUml.TypeScriptUml.generateClassDiagram(codeModel, options);
        };

        beforeEach(() => {
            codeModel = new Uml.CodeModel();
            codeModel.nodes.setValue("Foo", new Uml.Class("Foo"));
            codeModel.nodes.setValue("Bar", new Uml.Class("Bar"));
            codeModel.nodes.setValue("Baz", new Uml.Class("Baz", Uml.Stereotype.Interface));
            codeModel.nodes.setValue("Qux", new Uml.Class("Qux"));

            codeModel.associations.push(new Uml.Association("Foo", "Bar"));
            codeModel.associations.push(new Uml.Association("Bar", "Baz"));
            codeModel.associations.push(new Uml.Association("Qux", "Baz"));
            codeModel.generalizations.push(new Uml.Generalization("Foo", "Baz"));
            codeModel.generalizations.push(new Uml.Generalization("Qux", "Bar"));

            options = {
                formatter: "yuml",
            };
        });

        it("should call formatter with code model and return result", () => {
            const spy = sandbox.spy(Formatter.YumlFormatter.prototype, "generateClassDiagram");
            const returnValue = executeCut();
            expect(spy)
                .to.have.been.calledOnce
                .and.calledWith(sinon.match.instanceOf(Uml.CodeModel))
                .and.returned(returnValue);
            expect(spy.firstCall.args[0])
                .to.deep.equal(codeModel);
        });

        it("should throw Error for unknown formatter", () => {
            (options as any).formatter = "non-existing-formatter";
            expect(executeCut).to.throw(/non-existing-formatter/);
        });

        it("should remove excluded nodes from code model", () => {
            options.nodes = {
                exclude: ["Bar"],
            };

            const spy = sandbox.spy(Formatter.YumlFormatter.prototype, "generateClassDiagram");
            const returnValue = executeCut();
            expect(spy)
                .to.have.been.calledOnce
                .and.calledWith(sinon.match.instanceOf(Uml.CodeModel));

            const argCodeModel = spy.firstCall.args[0] as Uml.CodeModel;
            expect(argCodeModel.nodes.containsKey("Bar")).to.be.false;

            expect(argCodeModel.nodes.containsKey("Foo")).to.be.true;
            expect(argCodeModel.nodes.containsKey("Baz")).to.be.true;
            expect(argCodeModel.nodes.containsKey("Qux")).to.be.true;

            expect(argCodeModel.associations).to.eql([codeModel.associations[2]]);
            expect(argCodeModel.generalizations).to.eql([codeModel.generalizations[0]]);
        });

        it("should only add include nodes in code model for formatter", () => {
            options.nodes = {
                include: ["Bar"],
            };

            const spy = sandbox.spy(Formatter.YumlFormatter.prototype, "generateClassDiagram");
            const returnValue = executeCut();
            expect(spy)
                .to.have.been.calledOnce
                .and.calledWith(sinon.match.instanceOf(Uml.CodeModel));

            const argCodeModel = spy.firstCall.args[0] as Uml.CodeModel;
            expect(argCodeModel.nodes.containsKey("Bar")).to.be.true;

            expect(argCodeModel.nodes.containsKey("Foo")).to.be.false;
            expect(argCodeModel.nodes.containsKey("Baz")).to.be.false;
            expect(argCodeModel.nodes.containsKey("Qux")).to.be.false;

            expect(argCodeModel.associations).to.eql([]);
            expect(argCodeModel.generalizations).to.eql([]);
        });

    });
});
