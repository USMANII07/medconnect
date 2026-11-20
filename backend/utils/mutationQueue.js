// Serialize stock-affecting JSON mutations in this Node process.
let queue = Promise.resolve();
module.exports = function enqueueMutation(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
};
