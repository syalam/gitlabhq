import _ from 'underscore';
import { isTestEnvironment } from '~/environment';
import store from '../stores';
import DecorationsController from './decorations/controller';
import DirtyDiffController from './diff/controller';
import Disposable from './common/disposable';
import ModelManager from './common/model_manager';
import editorOptions, { defaultEditorOptions } from './editor_options';
import gitlabTheme from './themes/gl_theme';
import keymap from './keymap.json';

export const clearDomElement = el => {
  if (!el || !el.firstChild) return;

  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
};

export default class Editor {
  static create(monaco) {
    if (this.editorInstance) return this.editorInstance;

    this.editorInstance = new Editor(monaco);

    return this.editorInstance;
  }

  constructor(monaco) {
    this.monaco = monaco;
    this.currentModel = null;
    this.instance = null;
    this.dirtyDiffController = null;
    this.disposable = new Disposable();
    this.modelManager = new ModelManager(this.monaco);
    this.decorationsController = new DecorationsController(this);

    this.setupMonacoTheme();

    this.debouncedUpdate = _.debounce(() => {
      this.updateDimensions();
    }, 200);
  }

  createInstance(domElement) {
    if (!this.instance) {
      clearDomElement(domElement);

      this.disposable.add(
        (this.instance = this.monaco.editor.create(domElement, {
          ...defaultEditorOptions,
        })),
        (this.dirtyDiffController = new DirtyDiffController(
          this.modelManager,
          this.decorationsController,
        )),
      );

      this.addCommands();

      window.addEventListener('resize', this.debouncedUpdate, false);
    }
  }

  createDiffInstance(domElement) {
    if (!this.instance) {
      clearDomElement(domElement);

      this.disposable.add(
        (this.instance = this.monaco.editor.createDiffEditor(domElement, {
          ...defaultEditorOptions,
          readOnly: true,
          quickSuggestions: false,
          occurrencesHighlight: false,
          renderLineHighlight: 'none',
          hideCursorInOverviewRuler: true,
          renderSideBySide: Editor.renderSideBySide(domElement),
        })),
      );

      this.addCommands();

      window.addEventListener('resize', this.debouncedUpdate, false);
    }
  }

  createModel(file, head = null) {
    return this.modelManager.addModel(file, head);
  }

  attachModel(model) {
    if (this.isDiffEditorType) {
      this.instance.setModel({
        original: model.getOriginalModel(),
        modified: model.getModel(),
      });

      return;
    }

    this.instance.setModel(model.getModel());
    if (this.dirtyDiffController) this.dirtyDiffController.attachModel(model);

    this.currentModel = model;

    this.instance.updateOptions(
      editorOptions.reduce((acc, obj) => {
        Object.keys(obj).forEach(key => {
          Object.assign(acc, {
            [key]: obj[key](model),
          });
        });
        return acc;
      }, {}),
    );

    if (this.dirtyDiffController) this.dirtyDiffController.reDecorate(model);
  }

  attachMergeRequestModel(model) {
    this.instance.setModel({
      original: model.getBaseModel(),
      modified: model.getModel(),
    });

    this.monaco.editor.createDiffNavigator(this.instance, {
      alwaysRevealFirst: true,
    });
  }

  setupMonacoTheme() {
    this.monaco.editor.defineTheme(gitlabTheme.themeName, gitlabTheme.monacoTheme);

    this.monaco.editor.setTheme('gitlab');
  }

  clearEditor() {
    if (this.instance) {
      this.instance.setModel(null);
    }
  }

  dispose() {
    window.removeEventListener('resize', this.debouncedUpdate);

    // catch any potential errors with disposing the error
    // this is mainly for tests caused by elements not existing
    try {
      this.disposable.dispose();

      this.instance = null;
    } catch (e) {
      this.instance = null;

      if (!isTestEnvironment()) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    }
  }

  updateDimensions() {
    this.instance.layout();
    this.updateDiffView();
  }

  setPosition({ lineNumber, column }) {
    this.instance.revealPositionInCenter({
      lineNumber,
      column,
    });
    this.instance.setPosition({
      lineNumber,
      column,
    });
  }

  onPositionChange(cb) {
    if (!this.instance.onDidChangeCursorPosition) return;

    this.disposable.add(this.instance.onDidChangeCursorPosition(e => cb(this.instance, e)));
  }

  updateDiffView() {
    if (!this.isDiffEditorType) return;

    this.instance.updateOptions({
      renderSideBySide: Editor.renderSideBySide(this.instance.getDomNode()),
    });
  }

  get isDiffEditorType() {
    return this.instance.getEditorType() === 'vs.editor.IDiffEditor';
  }

  static renderSideBySide(domElement) {
    return domElement.offsetWidth >= 700;
  }

  addCommands() {
    const getKeyCode = key => {
      const monacoKeyMod = key.indexOf('KEY_') === 0;

      return monacoKeyMod ? this.monaco.KeyCode[key] : this.monaco.KeyMod[key];
    };

    keymap.forEach(command => {
      const keybindings = command.bindings.map(binding => {
        const keys = binding.split('+');

        // eslint-disable-next-line no-bitwise
        return keys.length > 1 ? getKeyCode(keys[0]) | getKeyCode(keys[1]) : getKeyCode(keys[0]);
      });

      this.instance.addAction({
        id: command.id,
        label: command.label,
        keybindings,
        run() {
          store.dispatch(command.action.name, command.action.params);
          return null;
        },
      });
    });
  }
}
