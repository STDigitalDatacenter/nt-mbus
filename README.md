# Newtelco M-Bus Node

M-Bus Application to grab data off Energy Monitors and make them available via other means.

Currently it is planned to provide the power data via SNMP to Netbox's [`axian-netbox-plugin-pdu`](https://github.com/minitriga/axians-netbox-plugin-pdu), but we may also make the data available via REST API endpoints to other applications, if needed.

## Notes

```
172.16.60.58 = [ '08781934523B0002', '08781944523B0002', '08781985523B0002' ]
```

## Usage

```js
node src/index.js
```

## Contributing

All contributions welcome!

## License

MIT
