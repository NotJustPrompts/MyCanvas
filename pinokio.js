module.exports = {
  version: "3.7",
  title: "MyCanvas",
  description: "A local-first thumbnail designer: text, effects, shapes and images over a canvas, exported to PNG/JPG.",
  icon: "brand/icon.svg",
  menu: async (kernel, info) => {
    const installed = info.exists("node_modules");
    const running = {
      install: info.running("install.json"),
      start: info.running("start.json"),
      update: info.running("update.json"),
    };

    if (running.install) {
      return [{
        default: "install.json",
        icon: "fa-solid fa-plug",
        text: "Installing...",
      }];
    }

    if (running.update) {
      return [{
        default: "update.json",
        icon: "fa-solid fa-terminal",
        text: "Updating...",
      }];
    }

    if (running.start) {
      const local = info.local("start.json");
      if (local && local.url) {
        return [{
          default: local.url,
          icon: "fa-solid fa-rocket",
          text: "Open Web UI",
        }, {
          icon: "fa-solid fa-terminal",
          text: "Terminal",
          href: "start.json",
        }];
      }
      return [{
        icon: "fa-solid fa-terminal",
        text: "Terminal",
        href: "start.json",
      }];
    }

    if (installed) {
      return [{
        default: "start.json",
        icon: "fa-solid fa-power-off",
        text: "Start",
      }, {
        icon: "fa-solid fa-plug",
        text: "Update",
        href: "update.json",
      }, {
        icon: "fa-solid fa-plug",
        text: "Install",
        href: "install.json",
      }];
    }

    return [{
      default: "install.json",
      icon: "fa-solid fa-plug",
      text: "Install",
    }];
  },
};
