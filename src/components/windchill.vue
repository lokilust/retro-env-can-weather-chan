<template>
  <div id="windchill">
    <div id="title">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Effect of Windchill</div>
    <ul id="windchill_table">
      <li><span>1350-1600</span>&nbsp;<span>Uncomfortably Cold</span></li>
      <li><span>1600-1800</span>&nbsp;<span>Risk of frostbite</span></li>
      <li>
        <span>1800-2000</span>&nbsp;<span>Exposed skin freezes<br />in a few minutes</span>
      </li>
      <li>
        <span>2000-2300</span>&nbsp;<span>Exposed skin freezes<br />in one minute</span>
      </li>
      <li><span>Over 2300</span>&nbsp;<span>Hazardous conditions</span></li>
    </ul>
  </div>
</template>

<script>
import { EventBus } from "../js/EventBus";

export default {
  name: "Windchill",
  props: {
    windchillSeason: Boolean,
  },

  computed: {
    windchillNotApplicable() {
      return !this.windchillSeason;
    },
  },

  data() {
    return {};
  },

  mounted() {
    if (this.windchillNotApplicable) EventBus.emit("windchill-complete");
  },

  unmounted() {},

  methods: {},
};
</script>

<style lang="scss" scoped>
#windchill_table {
  display: flex;
  flex-direction: column;
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    align-items: flex-start;
    display: flex;
  }
}
</style>
