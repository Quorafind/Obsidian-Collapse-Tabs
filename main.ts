import { App, Plugin, PluginSettingTab, setIcon, Setting } from "obsidian";

interface CollapseViewSettings {
	moveToggleButton: boolean;
}

export const COLLAPSE_TABS_SETTINGS: CollapseViewSettings = {
	moveToggleButton: true,
};

export default class CollapseViewPlugin extends Plugin {
	private observers: WeakMap<Element, MutationObserver>;
	settings: CollapseViewSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new CollapseTabsSettingTab(this.app, this));
		this.toggleCollapseButton();

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
		const modLeftSplit = activeDocument.body.find(".mod-left-split");
		const modRightSplit = activeDocument.body.find(".mod-right-split");

		if (modLeftSplit) {
			const leftObserver = new MutationObserver(
				this.handleMutations.bind(this)
			);
			leftObserver.observe(modLeftSplit, {
				childList: true,
				subtree: true,
			});
			this.observers.set(modLeftSplit, leftObserver);
		}

		if (modRightSplit) {
			const rightObserver = new MutationObserver(
				this.handleMutations.bind(this)
			);
			rightObserver.observe(modRightSplit, {
				childList: true,
				subtree: true,
			});
			this.observers.set(modRightSplit, rightObserver);
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
					// Remove is-collapsed class from related content

					this.restoreOriginalHeader(header);

					setTimeout(() => {
						const type = this.getHeaderType(header);
						const relatedContent = this.findRelatedContent(
							header,
							type
						);
						relatedContent.forEach((content) => {
							content.toggleClass("is-collapsed", false);
						});
					}, 0);
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

		// Remove our custom attributes and classes
		header.removeAttribute("data-collapse-processed");
		header.removeAttribute("data-original-content");

		// Restore original content
		header.empty();
		header.innerHTML = originalContent;
	}

	private transformTabHeader(header: HTMLElement) {
		// Store original content before processing
		header.setAttribute("data-original-content", header.innerHTML);

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
		const tabContainer = header.closest(".workspace-tabs");
		const relatedContent = this.findRelatedContent(header, type);

		if (relatedContent) {
			const isLastTab =
				!tabContainer?.nextElementSibling?.hasClass("workspace-tabs");

			relatedContent.forEach((content) => {
				const isCollapsed = !content.isShown();
				isCollapsed ? content.show() : content.hide();
				if (!isLastTab) {
					content.toggleClass("is-collapsed", !isCollapsed);
				}
			});
		}
	}

	// Public method to manually trigger rendering of all collapse buttons
	public renderAllCollapseButtons() {
		const workspaceTabs = activeDocument.body.findAll(
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
		const elements = activeDocument.body.findAll(
			"[data-collapse-processed]"
		);
		elements.forEach((element) => {
			const observer = this.observers.get(element);
			if (observer) {
				observer.disconnect();
			}
		});
		this.observers = new WeakMap();
	}

	public toggleCollapseButton() {
		document.body.toggleClass(
			"move-collapse-button",
			this.settings.moveToggleButton
		);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			COLLAPSE_TABS_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.toggleCollapseButton();
	}
}

export class CollapseTabsSettingTab extends PluginSettingTab {
	private plugin: CollapseViewPlugin;

	constructor(app: App, plugin: CollapseViewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName("Move toggle button")
			.setDesc("Move the toggle button to the left of the tab header")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.moveToggleButton);
				toggle.onChange((value) => {
					this.plugin.settings.moveToggleButton = value;
					this.plugin.saveSettings();
				});
			});
	}
}
