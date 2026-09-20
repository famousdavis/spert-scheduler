// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useMemo, useState } from "react";
import { getActiveStorageNamespace } from "@infrastructure/persistence/local-storage-repository";
import {
  isSectionCollapsed,
  setSectionCollapsed,
  type CollapsibleSection,
} from "@infrastructure/persistence/section-collapse-memory";

export interface SectionCollapse {
  collapsed: boolean;
  toggle: () => void;
  expand: () => void;
}

/** The user's last toggle, carrying everything it belongs to. */
interface Toggled {
  namespace: string;
  projectId: string;
  collapsed: boolean;
}

/**
 * Whether one section of a project's page is collapsed, remembered per project in this browser
 * (v0.71.0). Starts expanded.
 *
 * The page's per-project idiom (`ProjectPage`'s scenario `selection`): the last toggle is state
 * TAGGED with what it belongs to, and the value is DERIVED — that toggle while it still applies,
 * the stored memory otherwise. So nothing is reset in an effect when the project changes under a
 * mounted page, and a toggle whose storage write failed still shows.
 *
 * ⚠️ TAGGED WITH THE STORAGE NAMESPACE AS WELL AS THE PROJECT. Sign-out and sign-in happen in
 * place, with no navigation, so a toggle tagged by project alone outlives the user switch: on a
 * project both users can open, the next user would see the collapse the previous one chose.
 */
export function useSectionCollapse(
  projectId: string | undefined,
  section: CollapsibleSection,
): SectionCollapse {
  const [toggled, setToggled] = useState<Toggled | null>(null);
  // Read in render, like the stored memory below it. The namespace never changes on its own: a
  // sign-out empties the project store and a sign-in fills it, and either re-renders the page.
  const namespace = getActiveStorageNamespace();

  const collapsed = useMemo(() => {
    if (!projectId) return false;
    if (toggled && toggled.namespace === namespace && toggled.projectId === projectId) {
      return toggled.collapsed;
    }
    return isSectionCollapsed(projectId, section);
  }, [projectId, section, namespace, toggled]);

  const setCollapsed = useCallback(
    (next: boolean) => {
      if (!projectId) return;
      setToggled({ namespace: getActiveStorageNamespace(), projectId, collapsed: next });
      setSectionCollapsed(projectId, section, next);
    },
    [projectId, section],
  );

  const toggle = useCallback(() => setCollapsed(!collapsed), [setCollapsed, collapsed]);
  // A no-op when already expanded: the validation summary calls it before EVERY jump, inside
  // `flushSync`, and a state write there would re-render the whole page synchronously for nothing.
  const expand = useCallback(() => {
    if (collapsed) setCollapsed(false);
  }, [setCollapsed, collapsed]);

  return { collapsed, toggle, expand };
}
