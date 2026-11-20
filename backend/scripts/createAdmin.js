const readline = require("readline");
const bcrypt = require("bcryptjs");
const { readData, saveData } = require("../utils/database");

async function readHidden(prompt) {
    process.stdout.write(prompt);
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = "";
    return new Promise(resolve => {
        const onKeypress = (character, key) => {
            if (key && key.ctrl && key.name === "c") {
                process.stdin.off("keypress", onKeypress);
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                process.stdout.write("\n");
                process.exit(1);
            }
            if (key && key.name === "return") {
                process.stdin.off("keypress", onKeypress);
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                process.stdout.write("\n");
                resolve(value);
            } else if (key && key.name === "backspace") {
                value = value.slice(0, -1);
            } else if (!key || !key.ctrl && !key.meta) {
                value += character;
            }
        };
        process.stdin.on("keypress", onKeypress);
    });
}

async function main() {
    const name = await question("Admin name: ");
    const email = (await question("Admin email: ")).trim().toLowerCase();
    const password = await readHidden("Admin password (minimum 12 characters): ");
    if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
        throw new Error("Enter a name, valid email, and password of at least 12 characters.");
    }

    const users = await readData("users.json");
    if (users.some(user => typeof user.email === "string" && user.email.toLowerCase() === email)) {
        throw new Error("That email is already registered.");
    }
    users.push({
        id: Date.now().toString(),
        name: name.trim(),
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: "Admin",
        createdAt: new Date().toISOString()
    });
    await saveData("users.json", users);
    console.log("Admin account created. Public signup cannot create Admin accounts.");
}

function question(prompt) {
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => terminal.question(prompt, answer => {
        terminal.close();
        resolve(answer);
    }));
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
