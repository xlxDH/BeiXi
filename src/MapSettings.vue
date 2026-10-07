<script setup lang="ts">
import { ref } from "vue";
import { readMapConfig, saveMapConfig } from "./config";
const emit = defineEmits<{ close: [] }>();
const config = ref(readMapConfig()), error = ref("");
function save() {
  try { saveMapConfig(config.value); location.reload(); }
  catch (e) { error.value = (e as Error).message; }
}
</script>
<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <form class="editor-modal" role="dialog" aria-modal="true" aria-labelledby="map-settings-title" @submit.prevent="save">
      <h2 id="map-settings-title">地图服务设置</h2>
      <p>填写自己的浏览器地图 Key，仅保存在当前设备。保存并刷新前，请先保存成员设置。</p>
      <label>MapTiler Key（地图与默认搜索）<input v-model.trim="config.mapTilerKey" autocomplete="off" spellcheck="false" /></label>
      <label>腾讯地图 Key（中国大陆底图）<input v-model.trim="config.tencentKey" autocomplete="off" spellcheck="false" /></label>
      <label>自托管样式 URL（可选，优先于 MapTiler）<input v-model.trim="config.styleUrl" placeholder="https://maps.example.com/style.json" /></label>
      <label>额外地图署名（可选）<input v-model.trim="config.attribution" /></label>
      <p>Key 需开通相应服务并允许当前来源。发布版不提供腾讯 SK；腾讯签名查询请使用自行配置的源码版本。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="modal-actions"><button type="button" @click="emit('close')">取消</button><button type="submit">保存并刷新</button></div>
    </form>
  </div>
</template>
