<script>
import _ from 'underscore';
import { mapActions, mapGetters } from 'vuex';
import { polyfillSticky } from '~/lib/utils/sticky';
import ClipboardButton from '~/vue_shared/components/clipboard_button.vue';
import Icon from '~/vue_shared/components/icon.vue';
import FileIcon from '~/vue_shared/components/file_icon.vue';
import { GlTooltipDirective } from '@gitlab/ui';
import { truncateSha } from '~/lib/utils/text_utility';
import { __, s__, sprintf } from '~/locale';
import EditButton from './edit_button.vue';
import DiffStats from './diff_stats.vue';

export default {
  components: {
    ClipboardButton,
    EditButton,
    Icon,
    FileIcon,
    DiffStats,
  },
  directives: {
    GlTooltip: GlTooltipDirective,
  },
  props: {
    discussionPath: {
      type: String,
      required: false,
      default: '',
    },
    diffFile: {
      type: Object,
      required: true,
    },
    collapsible: {
      type: Boolean,
      required: false,
      default: false,
    },
    addMergeRequestButtons: {
      type: Boolean,
      required: false,
      default: false,
    },
    expanded: {
      type: Boolean,
      required: false,
      default: true,
    },
    canCurrentUserFork: {
      type: Boolean,
      required: true,
    },
  },
  data() {
    return {
      blobForkSuggestion: null,
    };
  },
  computed: {
    ...mapGetters('diffs', ['diffHasExpandedDiscussions', 'diffHasDiscussions']),
    hasExpandedDiscussions() {
      return this.diffHasExpandedDiscussions(this.diffFile);
    },
    icon() {
      if (this.diffFile.submodule) {
        return 'archive';
      }

      return this.diffFile.blob.icon;
    },
    titleLink() {
      if (this.diffFile.submodule) {
        return this.diffFile.submodule_tree_url || this.diffFile.submodule_link;
      }
      return this.discussionPath;
    },
    filePath() {
      if (this.diffFile.submodule) {
        return `${this.diffFile.file_path} @ ${truncateSha(this.diffFile.blob.id)}`;
      }

      if (this.diffFile.deleted_file) {
        return sprintf(__('%{filePath} deleted'), { filePath: this.diffFile.file_path }, false);
      }

      return this.diffFile.file_path;
    },
    titleTag() {
      return this.diffFile.file_hash ? 'a' : 'span';
    },
    isUsingLfs() {
      return this.diffFile.stored_externally && this.diffFile.external_storage === 'lfs';
    },
    collapseIcon() {
      return this.expanded ? 'chevron-down' : 'chevron-right';
    },
    viewFileButtonText() {
      const truncatedContentSha = _.escape(truncateSha(this.diffFile.content_sha));
      return sprintf(
        s__('MergeRequests|View file @ %{commitId}'),
        {
          commitId: `<span class="commit-sha">${truncatedContentSha}</span>`,
        },
        false,
      );
    },
    viewReplacedFileButtonText() {
      const truncatedBaseSha = _.escape(truncateSha(this.diffFile.diff_refs.base_sha));
      return sprintf(
        s__('MergeRequests|View replaced file @ %{commitId}'),
        {
          commitId: `<span class="commit-sha">${truncatedBaseSha}</span>`,
        },
        false,
      );
    },
    gfmCopyText() {
      return `\`${this.diffFile.file_path}\``;
    },
  },
  mounted() {
    polyfillSticky(this.$refs.header);
  },
  methods: {
    ...mapActions('diffs', ['toggleFileDiscussions']),
    handleToggleFile(e, checkTarget) {
      if (
        !checkTarget ||
        e.target === this.$refs.header ||
        (e.target.classList && e.target.classList.contains('diff-toggle-caret'))
      ) {
        this.$emit('toggleFile');
      }
    },
    showForkMessage() {
      this.$emit('showForkMessage');
    },
    handleToggleDiscussions() {
      this.toggleFileDiscussions(this.diffFile);
    },
  },
};
</script>

<template>
  <div
    ref="header"
    class="js-file-title file-title file-title-flex-parent"
    @click="handleToggleFile($event, true)"
  >
    <div class="file-header-content">
      <icon
        v-if="collapsible"
        :name="collapseIcon"
        :size="16"
        aria-hidden="true"
        class="diff-toggle-caret append-right-5"
        @click.stop="handleToggle"
      />
      <a v-once ref="titleWrapper" :href="titleLink" class="append-right-4 js-title-wrapper">
        <file-icon
          :file-name="filePath"
          :size="18"
          aria-hidden="true"
          css-classes="js-file-icon append-right-5"
        />
        <span v-if="diffFile.renamed_file">
          <strong
            v-gl-tooltip
            :title="diffFile.old_path"
            class="file-title-name"
            v-html="diffFile.old_path_html"
          ></strong>
          →
          <strong
            v-gl-tooltip
            :title="diffFile.new_path"
            class="file-title-name"
            v-html="diffFile.new_path_html"
          ></strong>
        </span>

        <strong v-else v-gl-tooltip :title="filePath" class="file-title-name" data-container="body">
          {{ filePath }}
        </strong>
      </a>

      <clipboard-button
        :title="__('Copy file path to clipboard')"
        :text="diffFile.file_path"
        :gfm="gfmCopyText"
        css-class="btn-default btn-transparent btn-clipboard"
      />

      <small v-if="diffFile.mode_changed" ref="fileMode">
        {{ diffFile.a_mode }} → {{ diffFile.b_mode }}
      </small>

      <span v-if="isUsingLfs" class="label label-lfs append-right-5"> {{ __('LFS') }} </span>
    </div>

    <div
      v-if="!diffFile.submodule && addMergeRequestButtons"
      class="file-actions d-none d-sm-block"
    >
      <diff-stats :added-lines="diffFile.added_lines" :removed-lines="diffFile.removed_lines" />
      <template v-if="diffFile.blob && diffFile.blob.readable_text">
        <button
          :disabled="!diffHasDiscussions(diffFile)"
          :class="{ active: hasExpandedDiscussions }"
          :title="s__('MergeRequests|Toggle comments for this file')"
          class="js-btn-vue-toggle-comments btn"
          type="button"
          @click="handleToggleDiscussions"
        >
          <icon name="comment" />
        </button>

        <edit-button
          v-if="!diffFile.deleted_file"
          :can-current-user-fork="canCurrentUserFork"
          :edit-path="diffFile.edit_path"
          :can-modify-blob="diffFile.can_modify_blob"
          @showForkMessage="showForkMessage"
        />
      </template>

      <a
        v-if="diffFile.replaced_view_path"
        :href="diffFile.replaced_view_path"
        class="btn view-file js-view-file"
        v-html="viewReplacedFileButtonText"
      >
      </a>
      <a :href="diffFile.view_path" class="btn view-file js-view-file" v-html="viewFileButtonText">
      </a>

      <a
        v-if="diffFile.external_url"
        v-gl-tooltip.hover
        :href="diffFile.external_url"
        :title="`View on ${diffFile.formatted_external_url}`"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-file-option"
      >
        <icon name="external-link" />
      </a>
    </div>
  </div>
</template>
