import { Plugin, setIcon } from "obsidian";

export default class CollapseViewPlugin extends Plugin {
	private observers: WeakMap<Element, MutationObserver>;

	async onload() {
		this.observers = new WeakMap();

		this.app.workspace.onLayoutReady(() => {
			this.initializeMainObserver();
			this.renderAllCollapseButtons();
		});
	}

	onunload() {
		// Cleanup all observers
		this.disconnectAllObservers();
	}

	private initializeMainObserver() {
		const modLeftSplit = document.querySelector(".mod-left-split");
		if (modLeftSplit) {
			const observer = new MutationObserver(
				this.handleMutations.bind(this)
			);
			observer.observe(modLeftSplit, {
				childList: true,
				subtree: true,
			});
			this.observers.set(modLeftSplit, observer);
		}
	}

	private handleMutations(mutations: MutationRecord[]) {
		for (const mutation of mutations) {
			const addedNodes = Array.from(mutation.addedNodes);
			for (const node of addedNodes) {
				if (node instanceof HTMLElement) {
					if (node.matches(".workspace-tabs")) {
						this.processWorkspaceTabs(node);
					}
				}
			}
		}
	}

	private processWorkspaceTabs(tabsContainer: HTMLElement) {
		// Set up observer for this specific workspace-tabs container
		if (!this.observers.has(tabsContainer)) {
			const observer = new MutationObserver((mutations) => {
				this.processTabHeaders(tabsContainer);
			});
			observer.observe(tabsContainer, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["class", "aria-label"],
			});
			this.observers.set(tabsContainer, observer);
		}

		// Process existing headers
		this.processTabHeaders(tabsContainer);
	}

	private processTabHeaders(container: HTMLElement) {
		const headers = container.querySelectorAll(".workspace-tab-header");
		const unprocessedHeaders = container.querySelectorAll(
			".workspace-tab-header:not([data-collapse-processed])"
		);

		// If there's more than one header, restore any processed headers and return
		if (headers.length > 1) {
			headers.forEach((header) => {
				if (
					header instanceof HTMLElement &&
					header.hasAttribute("data-collapse-processed")
				) {
					this.restoreOriginalHeader(header);
				}
			});
			return;
		}

		// Process single header case
		unprocessedHeaders.forEach((header) => {
			if (header instanceof HTMLElement) {
				this.transformTabHeader(header);
			}
		});
	}

	private restoreOriginalHeader(header: HTMLElement) {
		// Get the original content from data attribute
		const originalContent = header.getAttribute("data-original-content");
		if (!originalContent) return;

		// Get the original flex-grow value
		const originalFlexGrow = header.getAttribute("data-original-flex-grow");

		// Remove our custom attributes and classes
		header.removeAttribute("data-collapse-processed");
		header.removeAttribute("data-original-content");
		header.removeAttribute("data-original-flex-grow");

		// Restore original content
		header.empty();
		header.innerHTML = originalContent;

		// Restore original flex-grow
		if (originalFlexGrow) {
			header.style.flexGrow = originalFlexGrow;
		}
	}

	private transformTabHeader(header: HTMLElement) {
		// Store original content and flex-grow before processing
		header.setAttribute("data-original-content", header.innerHTML);
		const computedStyle = window.getComputedStyle(header);
		header.setAttribute("data-original-flex-grow", computedStyle.flexGrow);

		// Mark as processed to prevent duplicate processing
		header.setAttribute("data-collapse-processed", "true");

		// Extract text content safely
		const content = this.extractHeaderContent(header);

		const type = this.getHeaderType(header);

		header.empty();

		const wrapper = header.createEl("div", {
			cls: "collapse-view-header-wrapper",
		});

		wrapper.createEl("span", {
			cls: "collapse-view-text",
			text: content,
		});

		wrapper.createEl(
			"span",
			{
				cls: "collapse-view-btn clickable-icon",
				attr: {
					"aria-label": "Toggle collapse",
					"data-collapsed": "false",
				},
			},
			(el) => {
				setIcon(el, "chevron-down");
				el.addEventListener("click", (e) => {
					e.stopPropagation();
					this.toggleCollapse(header, type);
					el.dataset.collapsed =
						el.dataset.collapsed === "true" ? "false" : "true";
				});
			}
		);
	}

	private extractHeaderContent(header: HTMLElement): string {
		// Try to get content from aria-label first
		const ariaLabel = header.getAttribute("aria-label");
		if (ariaLabel) return ariaLabel;

		// Otherwise, collect text from all child nodes
		return (
			Array.from(header.childNodes)
				.map((node) => node.textContent?.trim())
				.filter(Boolean)
				.join(" ") || "Untitled"
		);
	}

	private getHeaderType(header: HTMLElement): string {
		const type = header.getAttribute("data-type");
		if (type) return type;
		return "search";
	}

	private findRelatedContent(
		header: HTMLElement,
		type: string
	): HTMLElement[] {
		const tabContainer = header.closest(".workspace-tabs");
		if (tabContainer) {
			return Array.from(
				tabContainer.querySelectorAll(
					`.workspace-leaf-content[data-type="${type}"]`
				)
			);
		}
		return [];
	}

	private toggleCollapse(header: HTMLElement, type: string) {
		const relatedContent = this.findRelatedContent(header, type);

		if (relatedContent) {
			relatedContent.forEach((content) => {
				const isCollapsed = !content.isShown();
				isCollapsed ? content.show() : content.hide();
				content.toggleClass("is-collapsed", !isCollapsed);
			});
		}
	}

	// Public method to manually trigger rendering of all collapse buttons
	public renderAllCollapseButtons() {
		const workspaceTabs = document.querySelectorAll(
			".mod-left-split .workspace-tabs, .mod-right-split .workspace-tabs"
		);
		workspaceTabs.forEach((tabs) => {
			if (tabs instanceof HTMLElement) {
				this.processWorkspaceTabs(tabs);
			}
		});
	}

	private disconnectAllObservers() {
		// Get all elements from the WeakMap
		const elements = document.querySelectorAll("[data-collapse-processed]");
		elements.forEach((element) => {
			const observer = this.observers.get(element);
			if (observer) {
				observer.disconnect();
			}
		});
		this.observers = new WeakMap();
	}
}
