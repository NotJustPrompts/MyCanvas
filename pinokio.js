module.exports = {
  version: "7.0",
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
        default: true,
        icon: "fa-solid fa-plug",
        text: "Installing",
        href: "install.json",
      }];
    }

    if (!installed) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Install",
        href: "install.json",
      }];
    }

    if (running.start) {
      const local = info.local("start.json");
      if (local && local.url) {
        return [{
          icon: "fa-solid fa-power-off",
          text: "Server",
          href: "start.json",
        }, {
          default: true,
          icon: "fa-solid fa-rocket",
          text: "Open Web UI",
          href: local.url,
        }];
      }
      return [{
        default: true,
        icon: "fa-solid fa-power-off",
        text: "Server",
        href: "start.json",
      }];
    }

    if (running.update) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Updating",
        href: "update.json",
      }];
    }

    return [{
      default: true,
      icon: "fa-solid fa-power-off",
      text: "Start",
      href: "start.json",
    }, {
      icon: "fa-solid fa-plug",
      text: "Update",
      href: "update.json",
    }, {
      icon: "fa-solid fa-plug",
      text: "Install",
      href: "install.json",
    }];
  },
};
