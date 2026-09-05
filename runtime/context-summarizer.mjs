export class ContextSummarizer {
  constructor(llmAdapter, config) {
    this._llmAdapter = llmAdapter || null;
    this._config = Object.assign({ maxTokensBeforeSummarize: 8000, summaryTargetTokens: 2000, preserveRecentMessages: 5 }, config || {});
  }
  needsSummarization(messages) { return this.estimateTokens(messages) > this._config.maxTokensBeforeSummarize; }
  estimateTokens(messages) {
    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') totalChars += msg.content.length;
      else if (Array.isArray(msg.content)) { for (const part of msg.content) { if (part.text) totalChars += part.text.length; } }
    }
    return Math.ceil(totalChars / 4);
  }
  async summarize(messages) {
    if (!this._llmAdapter) return { success: false, error: 'No LLM adapter', summary: null };
    try {
      const prompt = this._buildPrompt(messages);
      const response = await this._llmAdapter.chat([{ role: 'system', content: 'You are a conversation summarizer.' }, { role: 'user', content: prompt }]);
      const summary = response.content;
      const preserved = messages.slice(-this._config.preserveRecentMessages);
      return { success: true, summary: summary, summaryMessage: { role: 'assistant', content: summary, metadata: { type: 'summary' } }, preservedMessages: preserved, tokenSavings: this.estimateTokens(messages) - this.estimateTokens(preserved) };
    } catch (error) { return { success: false, error: error.message, summary: null }; }
  }
  _buildPrompt(messages) {
    return messages.map(function(msg) { return (msg.role || 'unknown') + ': ' + (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)).substring(0, 500); }).join('\n');
  }
  applySummary(messages, summaryResult) {
    if (!summaryResult.success) return messages;
    return [summaryResult.summaryMessage].concat(summaryResult.preservedMessages);
  }
}

let _instance = null;
export function getContextSummarizer(llmAdapter) { if (!_instance) _instance = new ContextSummarizer(llmAdapter); return _instance; }