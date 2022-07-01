class App {
    constructor () {
        this.groups = {
            [-1]: { id: -1 },
        }
    }

    init () {
        this.watchTabsAndGroups()

        this.listenForCommands()

        console.clear()
    }

    listenForCommands () {
        chrome.commands.onCommand.addListener(async command => {
            const index = command.slice(13) - 1
            let group = await this.getGroupByIndex(index)

            // Toggle the current group open/closed.
            this.toggle(group.id, { collapsed: ! group.collapsed })
            
            // Clase all other open groups except the current one.
            this.closeAllOpenGroups({ except: group.id })
            this.fixGlitch()

            // If all groups are collapsed, switch to the default group.
            group.collapsed || (group = this.groups[-1])
            
            chrome.tabs.update(group.lastActive || group.firstTab, { active: true })
        })
    }

    async fetchTabsAndGroups () {
        const allGroups = await chrome.tabGroups.query({})
        const knownGroupIds = { [-1]: true }
        
        // Update the groups in our internal mapping.
        allGroups.map(group => {
            this.groups[group.id] = { ...(this.groups[group.id] || {}), ...group }
            knownGroupIds[group.id] = true
        })

        // Clear out all the tab groups that have disappeared.
        Object.keys(this.groups).map(groupId => {
            if (! knownGroupIds[groupId]) {
                delete this.groups[groupId]
            }
        })

        // Update last active tab in its group.
        const active = await chrome.tabs.query({ active: true })

        this.groups[active[0].groupId].lastActive = active[0].id

        // Update first tab in each group.
        Object.keys(this.groups).map(groupId => {
            chrome.tabs.query({ groupId: +groupId }, tabs => {
                this.groups[groupId].firstTab = tabs[0].id
            })
        })
    }

    getGroupByIndex (index) {
        return new Promise(async resolve => {
            if (! this.groupIdsSortedByIndex) {
                this.groupIdsSortedByIndex = (await chrome.tabGroups.query({})).map(group => group.id)
            }

            resolve(this.groups[this.groupIdsSortedByIndex[index]])
        })
    }

    async toggle (id, { collapsed = false } = {}) {
        return await chrome.tabGroups.update(id, { collapsed })
    }

    async closeAllOpenGroups ({ except = null } = {}) {
        const openGroups = await chrome.tabGroups.query({ collapsed: false })

        openGroups.map(async group => {
            if (except !== group.id) {
                await this.toggle(group.id, { collapsed: true })
            }
        })
    }

    /**
     * Trigger all closed groups to close again to fix a weird glitch in Chrome.
     */
    fixGlitch () {
        setTimeout(() => chrome.tabGroups.query({ collapsed: true }, groups => {
            groups.map(group => this.toggle(group.id, { collapsed: true }))
        }), 300)
    }

    watchTabsAndGroups () {
        this.fetchTabsAndGroups()

        chrome.tabGroups.onCreated.addListener(() => this.fetchTabsAndGroups())
        chrome.tabGroups.onMoved.addListener(() => this.fetchTabsAndGroups())
        chrome.tabGroups.onRemoved.addListener(() => this.fetchTabsAndGroups())
        chrome.tabGroups.onUpdated.addListener(() => this.fetchTabsAndGroups())
        chrome.tabs.onActivated.addListener(() => this.fetchTabsAndGroups())
        chrome.tabs.onCreated.addListener(() => this.fetchTabsAndGroups())
        chrome.tabs.onRemoved.addListener(() => this.fetchTabsAndGroups())
        chrome.tabs.onReplaced.addListener(() => this.fetchTabsAndGroups())
        chrome.tabs.onUpdated.addListener(() => this.fetchTabsAndGroups())
    }
}

new App().init()
